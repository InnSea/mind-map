import {
  isSameObject,
  simpleDeepClone,
  transformTreeDataToObject,
  transformObjectToTreeData
} from '../utils/index'

class IncrementalSync {
  // 渲染过程产生的临时标记字段，不属于业务数据
  static _renderSideEffectFields = ['needUpdate', 'resetRichText']

  constructor(opt) {
    this.opt = opt
    this.mindMap = opt.mindMap
    // 平级对象形式的当前数据
    this.currentData = null
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
    this.currentData = transformTreeDataToObject(simpleDeepClone(data))
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
    }
  }

  /**
   * data_change 事件处理
   * 只有本地操作才会触发 data_change（远程 apply 绕过了 addHistory）
   * 对比 currentData 找出 diff 并发送
   */
  onDataChange(data) {
    const newData = transformTreeDataToObject(data)
    const oldData = this.currentData
    this.currentData = newData

    if (!oldData) return

    const ops = []
    const expandChangedUids = []
    const createdUids = new Set()
    const newKeys = Object.keys(newData)
    const oldKeys = Object.keys(oldData)

    for (let i = 0; i < newKeys.length; i++) {
      const uid = newKeys[i]
      if (!oldData[uid]) {
        createdUids.add(uid)
      } else if (!isSameObject(oldData[uid], newData[uid])) {
        const oldNode = oldData[uid]
        const newNode = newData[uid]
        // 判断是否仅展开/收起变化
        const isExpandChange =
          oldNode.data.expand !== newNode.data.expand &&
          isSameObject(
            { ...oldNode.data, expand: undefined },
            { ...newNode.data, expand: undefined }
          ) &&
          isSameObject(oldNode.children, newNode.children)
        if (isExpandChange) {
          expandChangedUids.push(uid)
        }
        ops.push({ action: 'update', uid, flatNode: newNode, oldFlatNode: oldNode, isExpandChange })
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
          flatNode: newData[uid],
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

    let filteredOps = ops.filter(op => {
      if (op.action !== 'update' || op.isExpandChange) return true
      const oldNode = oldData[op.uid]
      const newNode = newData[op.uid]
      const oldClean = this._stripRenderFields(oldNode.data)
      const newClean = this._stripRenderFields(newNode.data)
      return (
        !isSameObject(oldClean, newClean) ||
        !isSameObject(oldNode.children, newNode.children) ||
        oldNode.isRoot !== newNode.isRoot
      )
    })

    if (filteredOps.length > 0) {
      this.mindMap.emit('incremental_sync_ops', filteredOps)
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
    ops.forEach(op => {
      const { action, uid } = op
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

    const data = structuredClone(this.currentData)
    let changed = false

    allOps.forEach(op => {
      const { action, uid, flatNode } = op

      if (action === 'create') {
        if (data[uid]) return
        // 如果有 createdNodes，批量创建整棵子树
        const nodes = op.createdNodes || { [uid]: flatNode }
        const nodeUids = Object.keys(nodes)
        for (let i = 0; i < nodeUids.length; i++) {
          const nUid = nodeUids[i]
          if (data[nUid]) continue
          data[nUid] = nodes[nUid]
            ? structuredClone(nodes[nUid])
            : { isRoot: false, data: {}, children: [] }
        }
        changed = true
      } else if (action === 'update') {
        if (!data[uid]) return
        if (flatNode) {
          data[uid] = structuredClone(flatNode)
        }
        changed = true
      } else if (action === 'delete') {
        if (!data[uid]) return
        const keys = Object.keys(data)
        for (let i = 0; i < keys.length; i++) {
          const node = data[keys[i]]
          if (node.children && node.children.includes(uid)) {
            node.children = node.children.filter(id => id !== uid)
          }
        }
        this._deleteFromFlatData(data, uid)
        changed = true
      }
    })

    if (!changed) return

    const treeData = transformObjectToTreeData(data)
    if (!treeData) return

    // 直接操作底层 API，绕过 updateData 的 addHistory
    // handleData: 深拷贝 + 确保根节点 expand + 补全 uid
    const processedData = this.mindMap.handleData(treeData)
    if (!processedData) return
    // setData: 设置渲染树
    this.mindMap.renderer.setData(processedData)
    // 标记等待渲染完成
    this._waitingRenderEnd = true
    // render: 异步渲染，完成后触发 node_tree_render_end
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

  /**
   * 剥离渲染副作用字段，返回只含业务数据的浅拷贝
   * 同时将富文本标签归一化，避免 RichText 插件格式化导致的虚假 diff
   */
  _stripRenderFields(data) {
    const res = {}
    const skip = IncrementalSync._renderSideEffectFields
    Object.keys(data).forEach(key => {
      if (!skip.includes(key)) {
        res[key] = data[key]
      }
    })
    // 归一化富文本：去掉仅包裹用的 <span> 标签
    if (typeof res.text === 'string') {
      res.text = res.text.replace(/<span>(.*?)<\/span>/g, '$1')
    }
    return res
  }

  beforePluginRemove() {
    clearTimeout(this._applyTimer)
    this._opsQueue = []
    this._waitingRenderEnd = false
    this.currentData = null
    this.unBindEvent()
  }

  beforePluginDestroy() {
    this.beforePluginRemove()
  }
}

IncrementalSync.instanceName = 'incrementalSync'

export default IncrementalSync
