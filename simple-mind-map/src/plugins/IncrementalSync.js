import {
  isSameObject,
  simpleDeepClone,
  transformTreeDataToObject,
  transformObjectToTreeData
} from '../utils/index'

class IncrementalSync {
  // 渲染过程产生的临时标记字段
  static _renderSideEffectFields = ['needUpdate', 'resetRichText']

  constructor(opt) {
    this.opt = opt
    this.mindMap = opt.mindMap
    // 平级对象形式的当前数据
    this.currentData = null
    // 发送端：上次发送 ops 时的数据快照
    this._lastEmittedData = null
    // 发送端：防抖定时器
    this._emitTimer = null
    this._emitDelay = 80
    // 操作队列
    this._opsQueue = []
    this._applyTimer = null
    this._batchDelay = 50
    // 是否有待同步的远程渲染
    this._waitingRenderEnd = false
    // 渲染完成后的冷却期，防止 handleData 补全数据导致的虚假 diff
    this._cooldownTimer = null
    // 绑定事件
    this.bindEvent()
    // 初始化 currentData
    if (this.mindMap.opt.data) {
      this.currentData = transformTreeDataToObject(
        simpleDeepClone(this.mindMap.opt.data)
      )
      this._lastEmittedData = this.currentData
    }
  }

  bindEvent() {
    this._onDataChange = this.onDataChange.bind(this)
    this.mindMap.on('data_change', this._onDataChange)
    this._onSetData = this.onSetData.bind(this)
    this.mindMap.on('set_data', this._onSetData)
    this._onRenderEnd = this.onRenderEnd.bind(this)
    this.mindMap.on('node_tree_render_end', this._onRenderEnd)
  }

  unBindEvent() {
    this.mindMap.off('data_change', this._onDataChange)
    this.mindMap.off('set_data', this._onSetData)
    this.mindMap.off('node_tree_render_end', this._onRenderEnd)
  }

  onSetData(data) {
    const oldData = this.currentData
    this.currentData = transformTreeDataToObject(simpleDeepClone(data))
    this._lastEmittedData = this.currentData
    // 导入整份文件时，触发全量同步：把整棵新树作为一个 create 操作发出
    if (oldData) {
      const rootUid = Object.keys(this.currentData).find(
        uid => this.currentData[uid].isRoot
      )
      if (rootUid) {
        this.mindMap.emit('incremental_sync_ops', [
          {
            action: 'set_data',
            uid: rootUid,
            createdNodes: this.currentData
          }
        ])
      }
    }
  }

  /**
   * 渲染完成回调
   * 如果是远程 apply 触发的渲染，从渲染树同步 currentData
   */
  onRenderEnd() {
    if (!this._waitingRenderEnd) return
    this._waitingRenderEnd = false
    const renderTree = this.mindMap.renderer.renderTree
    if (renderTree) {
      this.currentData = transformTreeDataToObject(renderTree)
      this._lastEmittedData = this.currentData
    }
    // 设置冷却期，防止 RichText 等插件在渲染后立即触发 data_change 导致回环
    clearTimeout(this._cooldownTimer)
    this._cooldownTimer = setTimeout(() => {
      this._cooldownTimer = null
    }, 200)
  }

  /**
   * data_change 事件处理
   * 只有本地操作才会触发 data_change（远程 apply 绕过了 addHistory）
   * 防抖合并后对比 _lastEmittedData 找出 diff 并发送
   */
  onDataChange(data) {
    // 冷却期内不发送 ops，避免 RichText 等插件触发的虚假 diff
    if (this._cooldownTimer || this._waitingRenderEnd) {
      this.currentData = transformTreeDataToObject(data)
      this._lastEmittedData = this.currentData
      return
    }

    this.currentData = transformTreeDataToObject(data)

    // 防抖：合并短时间内的多次变更，只做一次 diff + emit
    if (this._emitTimer) {
      clearTimeout(this._emitTimer)
    }
    this._emitTimer = setTimeout(() => {
      this._emitTimer = null
      this._emitOps()
    }, this._emitDelay)
  }

  _emitOps() {
    const newData = this.currentData
    const oldData = this._lastEmittedData

    if (!oldData || !newData) return

    this._lastEmittedData = newData

    const ops = []
    const createdUids = new Set()
    const newKeys = Object.keys(newData)
    const oldKeys = Object.keys(oldData)

    for (let i = 0; i < newKeys.length; i++) {
      const uid = newKeys[i]
      if (!oldData[uid]) {
        createdUids.add(uid)
      } else {
        const oldNode = oldData[uid]
        const newNode = newData[uid]

        const oldClean = this._stripRenderFields(oldNode.data)
        const newClean = this._stripRenderFields(newNode.data)

        const dataChanged = !isSameObject(oldClean, newClean)
        const childrenChanged = this._childrenChanged(oldNode.children, newNode.children)
        const isRootChanged = oldNode.isRoot !== newNode.isRoot

        if (dataChanged || childrenChanged || isRootChanged) {
          const isExpandChange = !childrenChanged && !isRootChanged && this._isOnlyExpandChanged(oldClean, newClean)
          ops.push({ action: 'update', uid, flatNode: newNode, oldFlatNode: oldNode, isExpandChange })
        }
      }
    }

    // 构建新数据的 parentMap，用于判断 create 节点的父子关系
    const newParentMap = {}
    for (let i = 0; i < newKeys.length; i++) {
      const node = newData[newKeys[i]]
      if (node.children) {
        for (let j = 0; j < node.children.length; j++) {
          newParentMap[node.children[j]] = newKeys[i]
        }
      }
    }

    // 只发送顶层 create 节点，并收集整棵子树数据
    createdUids.forEach(uid => {
      const parentUid = newParentMap[uid] || null
      if (!parentUid || !createdUids.has(parentUid)) {
        const createdNodes = {}
        const stack = [uid]
        while (stack.length > 0) {
          const cur = stack.pop()
          const node = newData[cur]
          if (!node) continue
          createdNodes[cur] = node
          if (node.children) {
            for (let j = 0; j < node.children.length; j++) {
              if (createdUids.has(node.children[j])) {
                stack.push(node.children[j])
              }
            }
          }
        }
        ops.push({
          action: 'create',
          uid,
          parentUid,
          createdNodes
        })
      }
    })

    const parentMap = {}
    for (let i = 0; i < oldKeys.length; i++) {
      const node = oldData[oldKeys[i]]
      if (node.children) {
        for (let j = 0; j < node.children.length; j++) {
          parentMap[node.children[j]] = oldKeys[i]
        }
      }
    }

    // 收集所有被删除的uid
    const deletedSet = new Set()
    for (let i = 0; i < oldKeys.length; i++) {
      if (!newData[oldKeys[i]]) {
        deletedSet.add(oldKeys[i])
      }
    }
    // 只发送顶层删除节点
    deletedSet.forEach(uid => {
      const parentUid = parentMap[uid] || null
      if (!parentUid || !deletedSet.has(parentUid)) {
        // 收集被删子树的所有节点数据
        const deletedNodes = {}
        const stack = [uid]
        while (stack.length > 0) {
          const cur = stack.pop()
          const node = oldData[cur]
          if (!node) continue
          deletedNodes[cur] = node
          if (node.children) {
            for (let j = 0; j < node.children.length; j++) {
              stack.push(node.children[j])
            }
          }
        }
        ops.push({
          action: 'delete',
          uid,
          parentUid,
          flatNode: oldData[uid],
          deletedNodes
        })
      }
    })

    if (ops.length > 0) {
      this.mindMap.emit('incremental_sync_ops', ops)
    }
  }

  /**
   * 当前是否正在应用远程数据（供外部防回环使用）
   */
  isApplying() {
    return (
      this._waitingRenderEnd ||
      this._opsQueue.length > 0 ||
      !!this._applyTimer ||
      !!this._cooldownTimer
    )
  }

  /**
   * 应用远程增量操作（支持批量合并）
   */
  applyOps(operations) {
    if (!operations || operations.length === 0) return false
    this._opsQueue.push(...operations)
    if (this._applyTimer) return true
    this._applyTimer = setTimeout(() => {
      this._applyTimer = null
      this._flushOps()
    }, this._batchDelay)
    return true
  }

  _deduplicateOps(ops) {
    const uidMap = new Map()
    let setDataOp = null
    ops.forEach(op => {
      const { action, uid } = op
      if (action === 'set_data') {
        // set_data 是全量替换，覆盖之前所有 ops
        setDataOp = op
        uidMap.clear()
        return
      }
      const existing = uidMap.get(uid)
      if (action === 'create') {
        uidMap.set(uid, op)
      } else if (action === 'update') {
        if (existing && existing.action === 'create') {
          uidMap.set(uid, { ...op, action: 'create' })
        } else {
          uidMap.set(uid, op)
        }
      } else if (action === 'delete') {
        if (existing && existing.action === 'create') {
          uidMap.delete(uid)
        } else {
          uidMap.set(uid, op)
        }
      }
    })
    if (setDataOp) {
      return [setDataOp, ...Array.from(uidMap.values())]
    }
    return Array.from(uidMap.values())
  }

  _flushOps() {
    const rawOps = this._opsQueue.splice(0)
    if (rawOps.length === 0) return

    if (!this.currentData) {
      const renderTree = this.mindMap.renderer.renderTree
      if (!renderTree) return
      this.currentData = transformTreeDataToObject(renderTree)
    }

    const allOps = this._deduplicateOps(rawOps)
    if (allOps.length === 0) return

    // 不再 structuredClone 整个 currentData，只克隆被修改的节点
    const data = this.currentData
    let changed = false

    // 构建 parentMap，所有 delete 操作共用，避免重复扫描
    const parentMap = {}
    const keys = Object.keys(data)
    for (let i = 0; i < keys.length; i++) {
      const node = data[keys[i]]
      if (node.children) {
        for (let j = 0; j < node.children.length; j++) {
          parentMap[node.children[j]] = keys[i]
        }
      }
    }

    allOps.forEach(op => {
      const { action, uid, flatNode } = op

      if (action === 'set_data') {
        // 全量替换：直接用远端的完整数据重置
        const treeData = transformObjectToTreeData(op.createdNodes)
        if (treeData) {
          this._waitingRenderEnd = false
          clearTimeout(this._cooldownTimer)
          this._cooldownTimer = null
          this.mindMap.setData(treeData)
        }
        return
      }

      if (action === 'create') {
        if (data[uid]) return
        const nodes = op.createdNodes || { [uid]: flatNode }
        const nodeUids = Object.keys(nodes)
        for (let i = 0; i < nodeUids.length; i++) {
          const nUid = nodeUids[i]
          if (data[nUid]) continue
          data[nUid] = nodes[nUid]
            ? structuredClone(nodes[nUid])
            : { isRoot: false, data: {}, children: [] }
        }
        // 将新节点挂到父节点的 children 中
        if (op.parentUid && data[op.parentUid]) {
          const parentChildren = data[op.parentUid].children
          if (!parentChildren.includes(uid)) {
            data[op.parentUid] = structuredClone(data[op.parentUid])
            data[op.parentUid].children = [...parentChildren, uid]
          }
        }
        changed = true
      } else if (action === 'update') {
        if (!data[uid]) return
        if (flatNode) {
          if (op.isExpandChange) {
            data[uid] = structuredClone(flatNode)
          } else {
            const localNode = data[uid]
            const childrenDiff = this._childrenChanged(localNode.children, flatNode.children)

            const hasLocalExpand = localNode.data && 'expand' in localNode.data
            const localExpand = hasLocalExpand ? localNode.data.expand : undefined

            data[uid] = structuredClone(flatNode)

            if (data[uid].data && hasLocalExpand && !childrenDiff) {
              data[uid].data.expand = localExpand
            }
          }
        }
        changed = true
      } else if (action === 'delete') {
        if (!data[uid]) return
        // 使用预构建的 parentMap，避免 O(N) 扫描
        const parentUid = parentMap[uid]
        if (parentUid && data[parentUid]) {
          const node = data[parentUid]
          data[parentUid] = { ...node, children: node.children.filter(id => id !== uid) }
        }
        this._deleteFromFlatData(data, uid)
        changed = true
      }
    })

    if (!changed) return

    // transformObjectToTreeData 已经做了 simpleDeepClone，不需要 handleData 再做一次
    const treeData = transformObjectToTreeData(data)
    if (!treeData) return

    // handleData 的两个必要操作：确保根节点 expand + 补全 uid
    if (treeData.data && !treeData.data.expand) {
      treeData.data.expand = true
    }

    this.mindMap.renderer.setData(treeData)
    this.currentData = data

    this._waitingRenderEnd = true
    this.mindMap.render()
  }

  _deleteFromFlatData(data, uid) {
    const stack = [uid]
    while (stack.length > 0) {
      const currentUid = stack.pop()
      const node = data[currentUid]
      if (!node) continue
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          stack.push(node.children[i])
        }
      }
      delete data[currentUid]
    }
  }

  _childrenChanged(oldChildren, newChildren) {
    if (!oldChildren && !newChildren) return false
    if (!oldChildren || !newChildren) return true
    if (oldChildren.length !== newChildren.length) return true
    for (let i = 0; i < oldChildren.length; i++) {
      if (oldChildren[i] !== newChildren[i]) return true
    }
    return false
  }

  _stripRenderFields(data) {
    const skip = IncrementalSync._renderSideEffectFields
    const text = data.text
    const needNormalize = typeof text === 'string' && text.indexOf('<span>') !== -1

    // 快速路径：检查是否有任一 skip 字段
    let hasSkipField = false
    for (let i = 0; i < skip.length; i++) {
      if (skip[i] in data) {
        hasSkipField = true
        break
      }
    }

    if (!hasSkipField && !needNormalize) {
      // 没有副作用字段、也不需要归一化，直接返回原对象
      return data
    }

    const res = {}
    const keys = Object.keys(data)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (skip.indexOf(key) === -1) {
        res[key] = data[key]
      }
    }
    if (needNormalize) {
      res.text = text.replace(/<span>(.*?)<\/span>/g, '$1')
    }
    return res
  }

  _isOnlyExpandChanged(oldData, newData) {
    const oldKeys = Object.keys(oldData)
    const newKeys = Object.keys(newData)
    const allKeys = new Set([...oldKeys, ...newKeys])
    for (const key of allKeys) {
      if (key === 'expand') continue
      if (oldData[key] !== newData[key]) {
        if (typeof oldData[key] === 'object' || typeof newData[key] === 'object') {
          if (!isSameObject(oldData[key], newData[key])) return false
        } else {
          return false
        }
      }
    }
    return allKeys.has('expand') && oldData.expand !== newData.expand
  }

  beforePluginRemove() {
    clearTimeout(this._applyTimer)
    clearTimeout(this._cooldownTimer)
    clearTimeout(this._emitTimer)
    this._opsQueue = []
    this._waitingRenderEnd = false
    this.currentData = null
    this._lastEmittedData = null
    this.unBindEvent()
  }

  beforePluginDestroy() {
    this.beforePluginRemove()
  }
}

IncrementalSync.instanceName = 'incrementalSync'

export default IncrementalSync