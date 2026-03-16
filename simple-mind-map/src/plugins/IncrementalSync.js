import {
  isSameObject,
  simpleDeepClone,
  transformTreeDataToObject,
  transformObjectToTreeData
} from '../utils/index'

/**
 * 增量同步插件
 *
 * 防回环机制：
 *   远程数据应用时不调用 updateData（会触发 addHistory → data_change），
 *   而是直接调用 handleData + setData + render，完全绕过 addHistory，
 *   从源头杜绝 data_change 事件，不存在回环可能。
 *   渲染完成后通过 node_tree_render_end 事件同步 currentData。
 *
 * 使用方式：
 *   MindMap.usePlugin(IncrementalSync)
 *
 *   mindMap.on('incremental_sync_ops', (ops) => {
 *     ws.send(JSON.stringify({ type: 'mindmap_ops', operations: ops }))
 *   })
 *
 *   ws.onmessage = (msg) => {
 *     mindMap.incrementalSync.applyOps(msg.operations)
 *   }
 */
class IncrementalSync {
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
    const newKeys = Object.keys(newData)
    const oldKeys = Object.keys(oldData)

    for (let i = 0; i < newKeys.length; i++) {
      const uid = newKeys[i]
      if (!oldData[uid]) {
        ops.push({ action: 'create', uid, flatNode: newData[uid] })
      } else if (!isSameObject(oldData[uid], newData[uid])) {
        ops.push({ action: 'update', uid, flatNode: newData[uid] })
      }
    }

    for (let i = 0; i < oldKeys.length; i++) {
      const uid = oldKeys[i]
      if (!newData[uid]) {
        ops.push({ action: 'delete', uid })
      }
    }

    if (ops.length > 0) {
      this.mindMap.emit('incremental_sync_ops', ops)
    }
  }

  /**
   * 当前是否正在应用远程数据（供外部防回环使用）
   */
  isApplying() {
    return this._waitingRenderEnd || this._opsQueue.length > 0 || !!this._applyTimer || !!this._cooldownTimer
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
        data[uid] = flatNode
          ? structuredClone(flatNode)
          : { isRoot: false, data: {}, children: [] }
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
