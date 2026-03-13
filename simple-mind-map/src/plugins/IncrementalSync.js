/**
 * 增量同步插件
 * 提供 applyIncrementalOps 方法，接收端调用即可应用远程增量操作
 * 
 * 使用方式：
 *   MindMap.usePlugin(IncrementalSync)
 *   
 *   // 发送端：监听增量变化
 *   mindMap.on('data_change_detail', (operations) => {
 *     const ops = mindMap.incrementalSync.serializeOps(operations)
 *     ws.send(JSON.stringify(ops))
 *   })
 *   
 *   // 接收端：应用远程操作
 *   ws.onmessage = (msg) => {
 *     mindMap.incrementalSync.applyOps(msg.operations)
 *   }
 */
class IncrementalSync {
  constructor(opt) {
    this.opt = opt
    this.mindMap = opt.mindMap
    this.isApplyingRemote = false
  }

  /**
   * 将 data_change_detail 事件的原始 operations 序列化为可传输的格式
   * @param {Array} operations - data_change_detail 事件抛出的原始数据
   * @returns {Array} 序列化后的操作数组
   */
  serializeOps(operations) {
    return operations.map(op => ({
      action: op.action,
      uid: op.data.data.uid,
      nodeData: op.data.data,
      childrenUids: (op.data.children || []).map(c =>
        typeof c === 'string' ? c : c.data?.uid
      ).filter(Boolean)
    }))
  }

  /**
   * 当前是否正在应用远程数据（用于防回环判断）
   * @returns {boolean}
   */
  isApplying() {
    return this.isApplyingRemote
  }

  /**
   * 应用远程增量操作
   * @param {Array} operations - 序列化后的操作数组
   * @returns {boolean} 是否成功应用
   */
  applyOps(operations) {
    if (!operations || operations.length === 0) return false

    const fullData = this.mindMap.getData(true)
    if (!fullData || !fullData.root) return false

    // 构建 uid 索引
    const nodeMap = {}
    const parentMap = {}
    const walk = (node, puid) => {
      nodeMap[node.data.uid] = node
      if (puid) parentMap[node.data.uid] = puid
      ;(node.children || []).forEach(c => walk(c, node.data.uid))
    }
    walk(fullData.root, null)

    // 按 create → update → delete 排序，确保依赖关系正确
    const creates = []
    const updates = []
    const deletes = []
    operations.forEach(op => {
      if (op.action === 'create') creates.push(op)
      else if (op.action === 'update') updates.push(op)
      else if (op.action === 'delete') deletes.push(op)
    })

    let changed = false

    // 1. 先创建
    creates.forEach(({ uid, nodeData }) => {
      nodeMap[uid] = { data: { ...nodeData }, children: [] }
      changed = true
    })

    // 2. 再更新
    updates.forEach(({ uid, nodeData, childrenUids }) => {
      if (!nodeMap[uid]) return
      nodeMap[uid].data = { ...nodeData }
      if (childrenUids) {
        const childMap = {}
        ;(nodeMap[uid].children || []).forEach(c => {
          childMap[c.data.uid] = c
        })
        nodeMap[uid].children = childrenUids
          .map(id => childMap[id] || nodeMap[id])
          .filter(Boolean)
      }
      changed = true
    })

    // 3. 最后删除
    deletes.forEach(({ uid }) => {
      if (!nodeMap[uid]) return
      const puid = parentMap[uid]
      if (puid && nodeMap[puid]) {
        nodeMap[puid].children = nodeMap[puid].children.filter(
          c => c.data.uid !== uid
        )
      }
      delete nodeMap[uid]
      changed = true
    })

    if (!changed) return false

    // 应用到画布
    this.isApplyingRemote = true
    this.mindMap.command.pause()
    this.mindMap.updateData(fullData.root)
    this.mindMap.command.recovery()

    const resetFlag = () => {
      this.isApplyingRemote = false
      this.mindMap.off('node_tree_render_end', resetFlag)
    }
    this.mindMap.on('node_tree_render_end', resetFlag)
    setTimeout(() => { this.isApplyingRemote = false }, 200)

    return true
  }

  // 插件生命周期
  beforePluginRemove() {}
  beforePluginDestroy() {}
}

IncrementalSync.instanceName = 'incrementalSync'

export default IncrementalSync
