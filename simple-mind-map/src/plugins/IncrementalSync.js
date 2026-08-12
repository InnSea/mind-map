import {
  isSameObject,
  simpleDeepClone,
  transformTreeDataToObject,
  transformObjectToTreeData
} from '../utils/index'

class IncrementalSync {
  // 渲染过程产生的临时标记字段
  static _renderSideEffectFields = ['needUpdate', 'resetRichText']
  static _historyRebaseNodeBudget = 60000
  static _historyRebaseByteBudget = 8 * 1024 * 1024
  static _minHistoryRebaseStates = 2

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
    this._remoteRenderVersion = 0
    this._renderReleaseTimer = null
    // 显式标记远端 setData/setFullData，避免依赖时间窗口吞掉真实本地输入
    this._remoteApplyDepth = 0
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
    this._onBeforeExecCommand = this.onBeforeExecCommand.bind(this)
    this.mindMap.on('beforeExecCommand', this._onBeforeExecCommand)
    this._onNodeImgDblclick = this.onNodeImgDblclick.bind(this)
    this.mindMap.on('node_img_dblclick', this._onNodeImgDblclick)
  }

  unBindEvent() {
    this.mindMap.off('data_change', this._onDataChange)
    this.mindMap.off('set_data', this._onSetData)
    this.mindMap.off('node_tree_render_end', this._onRenderEnd)
    this.mindMap.off('beforeExecCommand', this._onBeforeExecCommand)
    this.mindMap.off('node_img_dblclick', this._onNodeImgDblclick)
    clearTimeout(this._renderReleaseTimer)
  }

  onSetData(data) {
    const oldData = this.currentData
    this.currentData = transformTreeDataToObject(simpleDeepClone(data))
    this._lastEmittedData = this.currentData
    if (this._remoteApplyDepth > 0) return
    // 导入整份文件时，触发全量同步：把整棵新树作为一个 create 操作发出
    if (oldData) {
      const rootUid = Object.keys(this.currentData).find(
        uid => this.currentData[uid].isRoot
      )
      if (rootUid) {
        const op = {
          action: 'set_data',
          uid: rootUid,
          createdNodes: this._createDocumentNodesSnapshot(this.currentData, {
            includeExpand: true
          })
        }
        this.mindMap.emit('incremental_sync_ops', [op])
      }
    }
  }

  /**
   * 渲染完成回调
   * 如果是远程 apply 触发的渲染，从渲染树同步 currentData
   */
  onRenderEnd() {
    if (!this._waitingRenderEnd) return
    const renderVersion = this._remoteRenderVersion
    clearTimeout(this._renderReleaseTimer)
    this._renderReleaseTimer = setTimeout(() => {
      this._renderReleaseTimer = null
      if (renderVersion === this._remoteRenderVersion) {
        this._waitingRenderEnd = false
      }
    }, 0)
  }

  onBeforeExecCommand(name) {
    if (name !== 'BACK' && name !== 'FORWARD') return
    const command = this.mindMap.command
    if (command && command.addHistory && command.addHistory.flush) {
      command.addHistory.flush()
    }
    this._compactCommandHistory()
  }

  /**
   * 图片双击放大事件处理
   * 视图动作，不经过 op 管线，通过独立事件通道透传
   */
  onNodeImgDblclick(node, e) {
    if (this.isApplying()) return
    const url = node.getImageUrl()
    if (!url) return
    this.mindMap.emit('incremental_sync_view_image', {
      uid: node.nodeData && node.nodeData.data && node.nodeData.data.uid,
      url
    })
  }

  /**
   * data_change 事件处理
   * 只有本地操作才会触发 data_change（远程 apply 绕过了 addHistory）
   * 防抖合并后对比 _lastEmittedData 找出 diff 并发送
   */
  onDataChange(data) {
    // Command.back/forward 在没有可移动的历史位置时也会派发 data_change。
    // undefined 不是空文档，不能将它转换成 {} 后生成整图删除操作。
    if (!data) return
    const nextData = transformTreeDataToObject(data)
    // 远端渲染可能触发一次内容完全相同的 data_change，只过滤这个精确副本。
    // 渲染期间发生的真实本地输入仍会进入 diff，不能用冷却时间整体丢弃。
    if (
      this._remoteApplyDepth > 0 ||
      (this._waitingRenderEnd && this._isSameFlatData(nextData, this.currentData))
    ) {
      this.currentData = nextData
      this._lastEmittedData = nextData
      return
    }

    this.currentData = nextData

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
    const newRootUid = newKeys.find(uid => newData[uid].isRoot)
    const oldRootUid = oldKeys.find(uid => oldData[uid].isRoot)
    if (newRootUid && newRootUid !== oldRootUid) {
      this.mindMap.emit('incremental_sync_ops', [{
        action: 'set_data',
        uid: newRootUid,
        createdNodes: this._createDocumentNodesSnapshot(newData, {
          includeExpand: true
        })
      }])
      return
    }

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

        if (dataChanged || childrenChanged) {
          // 未设置 expand 与 true 语义相同。不能把 undefined 放进协议载荷，
          // JSON.stringify 会删除该字段并产生一个无法通过校验的空更新。
          const oldExpand = oldClean.expand !== false
          const newExpand = newClean.expand !== false
          const expandChanged = oldExpand !== newExpand
          const isOnlyExpandChange =
            !childrenChanged &&
            this._isOnlyExpandChanged(oldClean, newClean)
          if (!isOnlyExpandChange) {
            ops.push({
              action: 'update',
              uid,
              flatNode: this._createDocumentNodeSnapshot(newNode),
              changes: this._createNodeChanges(oldNode, newNode, ['expand']),
              isExpandChange: false
            })
          }
          if (expandChanged) {
            ops.push({
              action: 'update',
              uid,
              flatNode: {
                data: { expand: newExpand }
              },
              changes: {
                dataSet: { expand: newExpand },
                dataUnset: [],
                childrenAdded: [],
                childrenRemoved: [],
                childrenOrder: null
              },
              isExpandChange: true
            })
          }
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
          createdNodes: this._createDocumentNodesSnapshot(createdNodes)
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
        ops.push({
          action: 'delete',
          uid,
          parentUid
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
      this._remoteApplyDepth > 0
    )
  }

  isHistorySuppressed() {
    return this._waitingRenderEnd || this._remoteApplyDepth > 0
  }

  /**
   * 在保存/离开页面前立即发出防抖队列中的本地变更。
   */
  flushLocalChanges() {
    if (this._emitTimer) {
      clearTimeout(this._emitTimer)
      this._emitTimer = null
      this._emitOps()
    }
  }

  /**
   * 包裹远端触发的 setData/setFullData。同步事件会更新基线但不会回传操作。
   */
  withRemoteApply(callback) {
    this._remoteApplyDepth++
    try {
      return callback()
    } finally {
      this._remoteApplyDepth--
    }
  }

  /**
   * 应用远程增量操作（支持批量合并）
   * 传入 { sync: true } 时立即同步执行并返回 { applied, total }
   */
  applyOps(operations, options) {
    if (!operations || operations.length === 0) {
      return options && options.sync ? { applied: 0, total: 0 } : false
    }
    this._opsQueue.push(...operations)
    if (options && options.sync) {
      if (this._applyTimer) {
        clearTimeout(this._applyTimer)
        this._applyTimer = null
      }
      return this._flushOps()
    }
    if (this._applyTimer) return true
    this._applyTimer = setTimeout(() => {
      this._applyTimer = null
      this._flushOps()
    }, this._batchDelay)
    return true
  }

  _deduplicateOps(ops) {
    const result = []
    const createIndex = new Map()

    ops.forEach(op => {
      if (!op || !op.action) return
      if (op.action === 'set_data') {
        result.length = 0
        createIndex.clear()
        result.push(op)
        return
      }

      const index = createIndex.get(op.uid)
      const created = index === undefined ? null : result[index]
      if (created && op.action === 'update') {
        const nodes = simpleDeepClone(created.createdNodes)
        const createdRoot = nodes[op.uid]
        if (createdRoot) {
          nodes[op.uid] = this._applyNodeChanges(createdRoot, op.changes)
          result[index] = { ...created, createdNodes: nodes }
          return
        }
      }
      if (created && op.action === 'delete') {
        result[index] = null
        createIndex.delete(op.uid)
        return
      }

      result.push(op)
      if (op.action === 'create') createIndex.set(op.uid, result.length - 1)
    })

    return result.filter(Boolean)
  }

  _captureLocalChangesBeforeRemote() {
    const command = this.mindMap.command
    if (
      command &&
      command.addHistory &&
      typeof command.addHistory.flush === 'function'
    ) {
      command.addHistory.flush()
    }
    this.flushLocalChanges()
  }

  _applyOpsToFlatData(sourceData, operations, dependencyData) {
    let data = sourceData
    let changed = false
    let appliedCount = 0
    const parentMap = {}
    const dependencyParentMap = {}
    const rebuildParentMap = () => {
      Object.keys(parentMap).forEach(uid => delete parentMap[uid])
      const keys = Object.keys(data)
      for (let i = 0; i < keys.length; i++) {
        const node = data[keys[i]]
        if (node.children) {
          for (let j = 0; j < node.children.length; j++) {
            parentMap[node.children[j]] = keys[i]
          }
        }
      }
    }
    const detachFromPreviousParent = (childUid, nextParentUid) => {
      const previousParentUid = parentMap[childUid]
      if (
        !previousParentUid ||
        previousParentUid === nextParentUid ||
        !data[previousParentUid]
      ) {
        return
      }
      const previousParent = data[previousParentUid]
      data[previousParentUid] = {
        ...previousParent,
        children: previousParent.children.filter(id => id !== childUid)
      }
    }
    if (dependencyData) {
      Object.keys(dependencyData).forEach(parentUid => {
        const children = dependencyData[parentUid].children || []
        children.forEach(childUid => {
          dependencyParentMap[childUid] = parentUid
        })
      })
    }
    const restoringDependencies = new Set()
    const restoreDependencyNode = uid => {
      if (data[uid]) return true
      if (!dependencyData || !dependencyData[uid]) return false
      if (restoringDependencies.has(uid)) return false

      restoringDependencies.add(uid)
      const parentUid = dependencyParentMap[uid]
      if (parentUid && !restoreDependencyNode(parentUid)) {
        restoringDependencies.delete(uid)
        return false
      }

      const node = simpleDeepClone(dependencyData[uid])
      node.children = (node.children || []).filter(childUid => {
        return data[childUid] && dependencyParentMap[childUid] === uid
      })
      data[uid] = node

      if (parentUid && data[parentUid]) {
        const parent = data[parentUid]
        const children = (parent.children || []).slice()
        if (!children.includes(uid)) {
          const referenceChildren = dependencyData[parentUid].children || []
          const referenceIndex = referenceChildren.indexOf(uid)
          let insertIndex = children.length
          for (let i = referenceIndex + 1; i < referenceChildren.length; i++) {
            const nextSiblingIndex = children.indexOf(referenceChildren[i])
            if (nextSiblingIndex !== -1) {
              insertIndex = nextSiblingIndex
              break
            }
          }
          children.splice(insertIndex, 0, uid)
          data[parentUid] = { ...parent, children }
        }
      }

      restoringDependencies.delete(uid)
      rebuildParentMap()
      return true
    }
    rebuildParentMap()

    operations.forEach(op => {
      const { action, uid, flatNode } = op

      if (action === 'set_data') {
        data = simpleDeepClone(op.createdNodes)
        changed = Object.keys(data).length > 0
        rebuildParentMap()
        if (changed) appliedCount++
        return
      }

      if (action === 'create') {
        if (data[uid]) return
        if (
          op.parentUid &&
          !data[op.parentUid] &&
          !restoreDependencyNode(op.parentUid)
        ) {
          return
        }
        if (op.parentUid && !data[op.parentUid]) return
        const nodes = op.createdNodes
        const nodeUids = Object.keys(nodes)
        for (let i = 0; i < nodeUids.length; i++) {
          const nUid = nodeUids[i]
          if (data[nUid]) continue
          data[nUid] = nodes[nUid]
            ? simpleDeepClone(nodes[nUid])
            : { isRoot: false, data: {}, children: [] }
        }
        for (let i = 0; i < nodeUids.length; i++) {
          const createdUid = nodeUids[i]
          const children = data[createdUid].children || []
          for (let j = 0; j < children.length; j++) {
            detachFromPreviousParent(children[j], createdUid)
          }
        }
        if (op.parentUid && data[op.parentUid]) {
          const parentChildren = data[op.parentUid].children
          if (!parentChildren.includes(uid)) {
            data[op.parentUid] = simpleDeepClone(data[op.parentUid])
            data[op.parentUid].children = [...parentChildren, uid]
          }
        }
        changed = true
        appliedCount++
        rebuildParentMap()
        return
      }

      if (action === 'update') {
        if (!data[uid] && !restoreDependencyNode(uid)) return
        if (!data[uid] || !flatNode) return
        if (op.isExpandChange) {
          if (flatNode.data && 'expand' in flatNode.data) {
            const localNode = data[uid]
            data[uid] = {
              ...localNode,
              data: { ...localNode.data, expand: flatNode.data.expand }
            }
            changed = true
            appliedCount++
          }
          return
        }
        const changes = op.changes || {}
        ;(changes.childrenAdded || []).forEach(item => {
          detachFromPreviousParent(item.uid, uid)
        })
        data[uid] = this._applyNodeChanges(data[uid], changes)
        if (
          (changes.childrenAdded || []).length ||
          (changes.childrenRemoved || []).length ||
          Array.isArray(changes.childrenOrder)
        ) {
          rebuildParentMap()
        }
        changed = true
        appliedCount++
        return
      }

      if (action === 'delete') {
        if (!data[uid]) return
        const parentUid = parentMap[uid]
        if (parentUid && data[parentUid]) {
          const parent = data[parentUid]
          data[parentUid] = {
            ...parent,
            children: parent.children.filter(id => id !== uid)
          }
        }
        this._deleteFromFlatData(data, uid)
        changed = true
        appliedCount++
        rebuildParentMap()
      }
    })

    return { data, changed, appliedCount }
  }

  _rebaseCommandHistory(operations) {
    const command = this.mindMap.command
    const documentOps = operations.filter(
      op => op && !(op.action === 'update' && op.isExpandChange)
    )
    if (!command || !Array.isArray(command.history) || !command.history.length) {
      return true
    }
    if (!documentOps.length) return true
    if (documentOps.some(op => op.action === 'set_data')) return false

    this._limitCommandHistoryForRebase(documentOps)

    const oldActiveIndex = command.activeHistoryIndex
    const nextHistory = []
    let nextActiveIndex = 0
    try {
      const historyStates = command.history.map(historyItem => {
        const treeData = JSON.parse(historyItem)
        const flatData = transformTreeDataToObject(treeData)
        const parentMap = {}
        Object.keys(flatData).forEach(parentUid => {
          ;(flatData[parentUid].children || []).forEach(childUid => {
            parentMap[childUid] = parentUid
          })
        })
        return { treeData, flatData, parentMap }
      })
      // 远端内容依赖本地后续创建的节点时，将最早可用的依赖补入旧状态，
      // 让该创建步骤失去可撤销性，避免回退时连带删除其他用户的成果。
      const requiredDependencies = new Set()
      documentOps.forEach(op => {
        if (op.action === 'update') requiredDependencies.add(op.uid)
        if (op.action === 'create' && op.parentUid) {
          requiredDependencies.add(op.parentUid)
        }
      })

      historyStates.forEach((state, index) => {
        const dependencyData = {}
        requiredDependencies.forEach(requiredUid => {
          if (state.flatData[requiredUid]) return
          for (let i = index + 1; i < historyStates.length; i++) {
            const futureState = historyStates[i]
            if (!futureState.flatData[requiredUid]) continue
            let uid = requiredUid
            while (uid && futureState.flatData[uid]) {
              if (!dependencyData[uid]) {
                dependencyData[uid] = futureState.flatData[uid]
              }
              uid = futureState.parentMap[uid]
            }
            break
          }
        })

        const result = this._applyOpsToFlatData(
          state.flatData,
          documentOps,
          dependencyData
        )
        const rebasedTree = transformObjectToTreeData(result.data)
        if (!rebasedTree) throw new Error('远端操作导致历史状态缺少根节点')
        if (state.treeData.smmVersion !== undefined) {
          rebasedTree.smmVersion = state.treeData.smmVersion
        }
        const rebasedItem = JSON.stringify(rebasedTree)
        if (nextHistory[nextHistory.length - 1] !== rebasedItem) {
          nextHistory.push(rebasedItem)
        }
        if (index <= oldActiveIndex) nextActiveIndex = nextHistory.length - 1
      })
    } catch (error) {
      return false
    }

    command.history = nextHistory
    command.activeHistoryIndex = Math.max(
      0,
      Math.min(nextActiveIndex, nextHistory.length - 1)
    )
    this.mindMap.emit(
      'back_forward',
      command.activeHistoryIndex,
      command.history.length
    )
    return true
  }

  _limitCommandHistoryForRebase(documentOps) {
    const command = this.mindMap.command
    if (!command || !Array.isArray(command.history) || command.history.length < 3) {
      return false
    }

    const nodeCount = Math.max(1, Object.keys(this.currentData || {}).length)
    const structuralOps = documentOps.reduce((count, op) => {
      if (op.action === 'create' || op.action === 'delete') return count + 1
      const changes = op.changes || {}
      return count + (
        (changes.childrenAdded || []).length ||
        (changes.childrenRemoved || []).length ||
        Array.isArray(changes.childrenOrder)
          ? 1
          : 0
      )
    }, 0)
    const workMultiplier = 1 + Math.min(3, structuralOps)
    const activeIndex = Math.max(
      0,
      Math.min(Number(command.activeHistoryIndex) || 0, command.history.length - 1)
    )
    const activeHistoryItem = command.history[activeIndex]
    const activeBytes = typeof activeHistoryItem === 'string'
      ? Math.max(1, activeHistoryItem.length)
      : IncrementalSync._historyRebaseByteBudget
    const maxByNodes = Math.floor(
      IncrementalSync._historyRebaseNodeBudget / (nodeCount * workMultiplier)
    )
    const maxByBytes = Math.floor(
      IncrementalSync._historyRebaseByteBudget / (activeBytes * workMultiplier)
    )
    const maxStates = Math.max(
      IncrementalSync._minHistoryRebaseStates,
      Math.min(maxByNodes, maxByBytes)
    )
    if (command.history.length <= maxStates) return false

    const historyBeforeActive = Math.max(1, Math.floor((maxStates - 1) * 0.75))
    let start = Math.max(0, activeIndex - historyBeforeActive)
    let end = Math.min(command.history.length, start + maxStates)
    start = Math.max(0, end - maxStates)
    command.history = command.history.slice(start, end)
    command.activeHistoryIndex = activeIndex - start
    return true
  }

  _compactCommandHistory() {
    const command = this.mindMap.command
    if (!command || !Array.isArray(command.history) || command.history.length < 2) {
      return false
    }

    const oldActiveIndex = command.activeHistoryIndex
    const nextHistory = []
    const comparableHistory = []
    let nextActiveIndex = 0
    try {
      command.history.forEach((historyItem, index) => {
        const treeData = JSON.parse(historyItem)
        const flatData = transformTreeDataToObject(treeData)
        Object.keys(flatData).forEach(uid => {
          const node = flatData[uid]
          const data = { ...this._stripRenderFields(node.data || {}) }
          // expand 缺失和 true 都表示展开，二者不应形成空撤销步骤。
          if (data.expand !== false) delete data.expand
          flatData[uid] = { ...node, data }
        })

        const previous = comparableHistory[comparableHistory.length - 1]
        if (!previous || !this._isSameFlatData(previous, flatData)) {
          nextHistory.push(historyItem)
          comparableHistory.push(flatData)
        }
        if (index <= oldActiveIndex) nextActiveIndex = nextHistory.length - 1
      })
    } catch (error) {
      return false
    }

    if (nextHistory.length === command.history.length) return false
    command.history = nextHistory
    command.activeHistoryIndex = Math.max(
      0,
      Math.min(nextActiveIndex, nextHistory.length - 1)
    )
    this.mindMap.emit(
      'back_forward',
      command.activeHistoryIndex,
      command.history.length
    )
    return true
  }

  _flushOps() {
    // A remote render must never turn a still-debounced local edit into the new
    // baseline. Emit that edit first so the parent queue can replay it on conflict.
    this._captureLocalChangesBeforeRemote()
    const rawOps = this._opsQueue.splice(0)
    if (rawOps.length === 0) return { applied: 0, total: 0 }

    if (!this.currentData) {
      const renderTree = this.mindMap.renderer.renderTree
      if (renderTree) {
        this.currentData = transformTreeDataToObject(renderTree)
      } else if (rawOps.some(op => op && op.action === 'set_data')) {
        this.currentData = {}
      } else {
        return { applied: 0, total: rawOps.length }
      }
    }

    const allOps = this._deduplicateOps(rawOps)
    if (allOps.length === 0) return { applied: 0, total: rawOps.length }
    const hasDocumentChange = allOps.some(
      op => op && !(op.action === 'update' && op.isExpandChange)
    )

    // 检查是否有删除操作，如果有则先清除 active 状态
    // 避免删除当前编辑的节点时，编辑器 DOM 残留导致文字飘到左上角
    const hasDelete = allOps.some(op => op && op.action === 'delete')
    if (hasDelete) {
      try {
        // 获取当前正在编辑的节点
        const currentEditNode = this.mindMap.renderer?.textEdit?.getCurrentEditNode?.()

        // 检查被删除的节点中是否包含当前正在编辑的节点
        const deletingCurrentEdit = currentEditNode && allOps.some(op => {
          if (op.action !== 'delete') return false
          // 检查当前编辑节点或其祖先是否被删除
          let node = currentEditNode
          while (node) {
            if (node.nodeData?.data?.uid === op.uid) return true
            node = node.parent
          }
          return false
        })

        if (deletingCurrentEdit) {
          // 只有在删除当前编辑的节点时，才隐藏编辑器
          this.mindMap.renderer.textEdit.hideEditTextBox()
        }

        if (deletingCurrentEdit) {
          this.mindMap.execCommand('CLEAR_ACTIVE_NODE')
        }
      } catch (e) {
        // 忽略清除失败，继续应用操作
      }
    }

    const { data, changed, appliedCount } = this._applyOpsToFlatData(
      this.currentData,
      allOps
    )

    if (!changed) return { applied: appliedCount, total: rawOps.length }

    const historyRebased = !hasDocumentChange || this._rebaseCommandHistory(allOps)

    // transformObjectToTreeData 已经做了 simpleDeepClone，不需要 handleData 再做一次
    const treeData = transformObjectToTreeData(data)
    if (!treeData) return { applied: appliedCount, total: rawOps.length }

    // handleData 的两个必要操作：确保根节点 expand + 补全 uid
    if (treeData.data && !treeData.data.expand) {
      treeData.data.expand = true
    }

    this.mindMap.emit('incremental_sync_before_render', treeData)
    this.mindMap.renderer.setData(treeData)
    this.currentData = data
    this._lastEmittedData = data
    if (!historyRebased) this._resetCommandHistory()

    this._waitingRenderEnd = true
    this._remoteRenderVersion++
    this.mindMap.render()
    return { applied: appliedCount, total: rawOps.length }
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

  _createNodeChanges(oldNode, newNode, excludedDataKeys = []) {
    const oldData = this._stripRenderFields((oldNode && oldNode.data) || {})
    const newData = this._stripRenderFields((newNode && newNode.data) || {})
    const dataSet = {}
    const dataUnset = []
    const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
    keys.forEach(key => {
      if (excludedDataKeys.includes(key)) return
      if (!(key in newData)) {
        dataUnset.push(key)
      } else if (!(key in oldData) || !isSameObject(oldData[key], newData[key])) {
        dataSet[key] = simpleDeepClone(newData[key])
      }
    })

    const oldChildren = (oldNode && oldNode.children) || []
    const newChildren = (newNode && newNode.children) || []
    const oldSet = new Set(oldChildren)
    const newSet = new Set(newChildren)
    const childrenAdded = []
    const childrenRemoved = []
    newChildren.forEach((uid, index) => {
      if (!oldSet.has(uid)) childrenAdded.push({ uid, index })
    })
    oldChildren.forEach(uid => {
      if (!newSet.has(uid)) childrenRemoved.push(uid)
    })

    return {
      dataSet,
      dataUnset,
      childrenAdded,
      childrenRemoved,
      childrenOrder: this._childrenChanged(oldChildren, newChildren)
        ? newChildren.slice()
        : null
    }
  }

  _createDocumentNodeSnapshot(node, { includeExpand = false } = {}) {
    const snapshot = simpleDeepClone(node)
    snapshot.data = this._stripRenderFields(snapshot.data || {})
    if (!includeExpand) delete snapshot.data.expand
    return snapshot
  }

  _createDocumentNodesSnapshot(nodes, options) {
    const result = {}
    Object.keys(nodes).forEach(uid => {
      result[uid] = this._createDocumentNodeSnapshot(nodes[uid], options)
    })
    return result
  }

  _applyNodeChanges(node, changes) {
    const result = simpleDeepClone(node || { isRoot: false, data: {}, children: [] })
    result.data = result.data || {}
    result.children = Array.isArray(result.children) ? result.children : []

    ;(changes.dataUnset || []).forEach(key => {
      delete result.data[key]
    })
    Object.keys(changes.dataSet || {}).forEach(key => {
      result.data[key] = simpleDeepClone(changes.dataSet[key])
    })

    const removed = new Set(changes.childrenRemoved || [])
    let children = result.children.filter(uid => !removed.has(uid))
    ;(changes.childrenAdded || []).forEach(item => {
      if (!item || !item.uid || children.includes(item.uid)) return
      const index = Math.max(0, Math.min(Number(item.index) || 0, children.length))
      children.splice(index, 0, item.uid)
    })

    if (Array.isArray(changes.childrenOrder)) {
      const ordered = []
      changes.childrenOrder.forEach(uid => {
        if (children.includes(uid) && !ordered.includes(uid)) ordered.push(uid)
      })
      // 并发插入的未知 uid 必须保留；它们按服务端已确认的相对顺序追加。
      children.forEach(uid => {
        if (!ordered.includes(uid)) ordered.push(uid)
      })
      children = ordered
    }
    result.children = children
    return result
  }

  _isSameFlatData(left, right) {
    if (!left || !right) return left === right
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    for (let i = 0; i < leftKeys.length; i++) {
      const uid = leftKeys[i]
      const leftNode = left[uid]
      const rightNode = right[uid]
      if (!rightNode) return false
      if (leftNode.isRoot !== rightNode.isRoot) return false
      if (this._childrenChanged(leftNode.children, rightNode.children)) return false
      if (
        !isSameObject(
          this._stripRenderFields(leftNode.data || {}),
          this._stripRenderFields(rightNode.data || {})
        )
      ) {
        return false
      }
    }
    return true
  }

  _resetCommandHistory() {
    const command = this.mindMap.command
    if (!command) return
    try {
      const current = command.getCopyData()
      command.history = current ? [JSON.stringify(current)] : []
      command.activeHistoryIndex = 0
      this.mindMap.emit('back_forward', 0, command.history.length)
    } catch (error) {
      command.clearHistory()
    }
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
    clearTimeout(this._emitTimer)
    this._opsQueue = []
    this._waitingRenderEnd = false
    this._remoteApplyDepth = 0
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
