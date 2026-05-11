import {
  isSameObject,
  simpleDeepClone,
  transformTreeDataToObject,
  transformObjectToTreeData
} from '../utils/index'

// 仅包裹用的 <span> 标签（RichText 插件格式化产物），diff 前归一化以避免虚假变更
const SPAN_WRAPPER_RE = /<span>(.*?)<\/span>/g

class IncrementalSync {
  // 渲染过程产生的临时标记字段，不属于业务数据（Set 比数组 includes 更快）
  static _renderSideEffectFields = new Set(['needUpdate', 'resetRichText'])

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

    if (!oldData) {
      this.currentData = newData
      return
    }

    const newKeys = Object.keys(newData)
    const oldKeys = Object.keys(oldData)

    // 快速短路：节点数一致且每个节点都未变化，直接退出，避免后续 O(N) 构建与 diff
    if (newKeys.length === oldKeys.length) {
      let allSame = true
      for (let i = 0; i < newKeys.length; i++) {
        const uid = newKeys[i]
        if (!oldData[uid] || !isSameObject(oldData[uid], newData[uid])) {
          allSame = false
          break
        }
      }
      if (allSame) return
    }

    this.currentData = newData

    const ops = []
    const createdUids = new Set()

    for (let i = 0; i < newKeys.length; i++) {
      const uid = newKeys[i]
      if (!oldData[uid]) {
        createdUids.add(uid)
      } else if (!this._isNodeChangedForSync(oldData[uid], newData[uid])) {
        // 业务数据未变化（含 children/isRoot/strip 后的 data），跳过该节点
        continue
      } else {
        ops.push({
          action: 'update',
          uid,
          flatNode: newData[uid],
          oldFlatNode: oldData[uid]
        })
      }
    }

    // newParentMap 仅在存在新增节点时才构建，避免无 create 的常见 update 场景多走一遍 O(N)
    if (createdUids.size > 0) {
      const newParentMap = {}
      for (let i = 0; i < newKeys.length; i++) {
        const children = newData[newKeys[i]].children
        if (!children || children.length === 0) continue
        for (let j = 0; j < children.length; j++) {
          newParentMap[children[j]] = newKeys[i]
        }
      }
      // 只发送顶层 create 节点，并收集整棵子树数据
      createdUids.forEach(uid => {
        const parentUid = newParentMap[uid] || null
        if (parentUid && createdUids.has(parentUid)) return
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
      })
    }

    // 先快速判断是否有 delete，没有就连 parentMap 都不需要构建
    const deletedSet = new Set()
    for (let i = 0; i < oldKeys.length; i++) {
      if (!newData[oldKeys[i]]) {
        deletedSet.add(oldKeys[i])
      }
    }
    if (deletedSet.size > 0) {
      const parentMap = {}
      for (let i = 0; i < oldKeys.length; i++) {
        const children = oldData[oldKeys[i]].children
        if (!children || children.length === 0) continue
        for (let j = 0; j < children.length; j++) {
          parentMap[children[j]] = oldKeys[i]
        }
      }
      // 只发送顶层删除节点
      deletedSet.forEach(uid => {
        const parentUid = parentMap[uid] || null
        if (parentUid && deletedSet.has(parentUid)) return
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
      })
    }

    if (ops.length === 0) return

    // 业务侧钩子：允许在 emit 前观察 / 过滤 / 转换 ops，未返回数组则沿用原 ops
    const beforeIncrementalSync = this.mindMap.opt.beforeIncrementalSync
    let finalOps = ops
    if (typeof beforeIncrementalSync === 'function') {
      const ret = beforeIncrementalSync(ops, { oldData, newData })
      if (Array.isArray(ret)) finalOps = ret
    }

    if (finalOps.length > 0) {
      this.mindMap.emit('incremental_sync_ops', finalOps)
    }
  }

  /**
   * 判断节点是否发生了"需要同步"的业务变化
   * 剥离渲染副作用字段、忽略 expand，避免 RichText 格式化、展开折叠等触发虚假 diff
   */
  _isNodeChangedForSync(oldNode, newNode) {
    if (oldNode.isRoot !== newNode.isRoot) return true
    if (!isSameObject(oldNode.children, newNode.children)) return true
    const oldClean = this._stripRenderFields(oldNode.data)
    const newClean = this._stripRenderFields(newNode.data)
    oldClean.expand = undefined
    newClean.expand = undefined
    return !isSameObject(oldClean, newClean)
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

    // 浅克隆 flat map：每个节点仍指向 currentData 原始引用，修改某节点前再单独克隆该节点
    // 把单次 apply 的克隆成本从 O(节点总数 * 节点大小) 降到 O(受影响节点数 * 节点大小)
    const data = { ...this.currentData }
    const originalRef = this.currentData
    let changed = false

    // 若某个 uid 仍指向原 currentData 中的引用，则就地克隆一份再返回；保证后续修改不污染原数据
    const ensureOwned = uid => {
      const node = data[uid]
      if (!node) return null
      if (node === originalRef[uid]) {
        const cloned = {
          isRoot: node.isRoot,
          data: node.data,
          children: node.children ? node.children.slice() : []
        }
        data[uid] = cloned
        return cloned
      }
      return node
    }

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
          // 记录本地当前的 expand 状态
          const localNode = data[uid]
          const hasLocalExpand = localNode.data && 'expand' in localNode.data
          const localExpand = hasLocalExpand ? localNode.data.expand : undefined

          data[uid] = structuredClone(flatNode)

          // 恢复本地的 expand 状态，避免被远端覆盖
          if (data[uid].data && hasLocalExpand) {
            data[uid].data.expand = localExpand
          }
        }
        changed = true
      } else if (action === 'delete') {
        if (!data[uid]) return
        // 优先用 op 中携带的 parentUid 直接定位父节点（O(1)），fallback 到全表扫描兼容老消息
        const opParentUid = op.parentUid
        if (
          opParentUid &&
          data[opParentUid] &&
          Array.isArray(data[opParentUid].children) &&
          data[opParentUid].children.indexOf(uid) !== -1
        ) {
          const parent = ensureOwned(opParentUid)
          const idx = parent.children.indexOf(uid)
          if (idx !== -1) parent.children.splice(idx, 1)
        } else {
          const keys = Object.keys(data)
          for (let i = 0; i < keys.length; i++) {
            const node = data[keys[i]]
            if (node.children && node.children.indexOf(uid) !== -1) {
              const parent = ensureOwned(keys[i])
              parent.children = parent.children.filter(id => id !== uid)
            }
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
    const keys = Object.keys(data)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (!skip.has(key)) res[key] = data[key]
    }
    // 归一化富文本：仅在确实含包裹用 <span> 时才执行替换，避免每次 update 走一遍全局正则
    const text = res.text
    if (typeof text === 'string' && text.indexOf('<span>') !== -1) {
      res.text = text.replace(SPAN_WRAPPER_RE, '$1')
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
