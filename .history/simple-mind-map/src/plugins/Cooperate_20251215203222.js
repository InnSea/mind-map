import {
  isSameObject,
  simpleDeepClone,
  getType,
  isUndef,
  transformTreeDataToObject,
  transformObjectToTreeData
} from '../utils/index'

// 协同插件 - 支持 postMessage 模式（用于 iframe 与父项目通信）
class Cooperate {
  constructor(opt) {
    this.opt = opt
    this.mindMap = opt.mindMap
    // 当前的平级对象类型的思维导图数据
    this.currentData = null
    // 用户信息
    this.userInfo = null
    // 是否正在重新设置思维导图数据
    this.isSetData = false
    // 是否已连接
    this.connected = false
    // 感知数据
    this.awarenessStates = new Map()
    this.currentAwarenessData = []
    this.waitNodeUidMap = {}
    // postMessage 配置
    this.targetOrigin = '*'
    this.parentWindow = null
    // 绑定事件
    this.bindEvent()
    // 处理实例化时传入的思维导图数据
    if (this.mindMap.opt.data) {
      this.initData(this.mindMap.opt.data)
    }
  }

  // 初始化数据
  initData(data) {
    data = simpleDeepClone(data)
    // 思维导图树结构转平级对象结构
    this.currentData = transformTreeDataToObject(data)
  }

  // 设置 postMessage 模式的连接
  /**
   * @param {Object} config
   * @param {string} config.roomId - 房间ID（思维导图ID）
   * @param {string} config.targetOrigin - 目标源，默认 '*'
   * @param {Window} config.parentWindow - 父窗口，默认 window.parent
   */
  setProvider(provider, config = {}) {
    const { roomId, targetOrigin = '*', parentWindow } = config

    this.roomId = roomId
    this.targetOrigin = targetOrigin
    this.parentWindow = parentWindow || window.parent

    // 监听父页面消息
    this._onMessage = this._onMessage.bind(this)
    window.addEventListener('message', this._onMessage)

    // 发送连接请求
    this._postToParent({
      type: 'cooperate_connect',
      roomId: this.roomId
    })

    // 发送当前数据进行全量同步
    if (this.currentData && Object.keys(this.currentData).length > 0) {
      this._postToParent({
        type: 'cooperate_full_sync',
        roomId: this.roomId,
        data: this.currentData
      })
    }
  }

  // 发送消息给父页面
  _postToParent(data) {
    if (!this.parentWindow) return
    this.parentWindow.postMessage(
      {
        source: 'mindmap-cooperate',
        ...data
      },
      this.targetOrigin
    )
  }

  // 接收父页面消息
  _onMessage(event) {
    const data = event.data
    if (!data || data.source !== 'cooperate-parent') return

    switch (data.type) {
      case 'connected':
        this.connected = true
        this.mindMap.emit('cooperate_status', 'connected')
        break

      case 'disconnected':
        this.connected = false
        this.mindMap.emit('cooperate_status', 'disconnected')
        break

      case 'init':
        // 收到初始化数据（加入房间时服务端发送的已有数据）
        this._handleRemoteData(data.data, 'init')
        break

      case 'update':
        // 收到节点更新
        this._handleRemoteUpdate(data.changes)
        break

      case 'delete':
        // 收到节点删除
        this._handleRemoteDelete(data.uids)
        break

      case 'full_sync':
        // 收到全量同步
        this._handleRemoteData(data.data, 'full_sync')
        break

      case 'awareness':
        // 收到其他用户的感知数据
        this._handleRemoteAwareness(data.clientId, data.userInfo, data.nodeIds)
        break

      case 'awareness_sync':
        // 收到所有用户的感知数据
        this._handleAwarenessSync(data.data)
        break

      case 'awareness_remove':
        // 其他用户离开
        this._handleAwarenessRemove(data.clientId)
        break
    }
  }

  // 处理远程数据（初始化或全量同步）
  _handleRemoteData(data, type) {
    if (!data || Object.keys(data).length === 0) return
    // 如果本地没有数据，或者是全量同步，则直接使用远程数据
    if (
      !this.currentData ||
      Object.keys(this.currentData).length === 0 ||
      type === 'full_sync'
    ) {
      this.currentData = data
      const treeData = transformObjectToTreeData(data)
      if (treeData) {
        this.isSetData = true
        this.mindMap.setData(treeData)
      }
    }
  }

  // 处理远程更新
  _handleRemoteUpdate(changes) {
    if (!changes || Object.keys(changes).length === 0) return
    // 合并更新
    Object.assign(this.currentData, changes)
    // 转换并更新思维导图
    const treeData = transformObjectToTreeData(this.currentData)
    if (treeData) {
      this.mindMap.updateData(treeData)
    }
  }

  // 处理远程删除
  _handleRemoteDelete(uids) {
    if (!uids || uids.length === 0) return
    // 删除节点
    uids.forEach(uid => delete this.currentData[uid])
    // 转换并更新思维导图
    const treeData = transformObjectToTreeData(this.currentData)
    if (treeData) {
      this.mindMap.updateData(treeData)
    }
  }

  // 处理远程感知数据
  _handleRemoteAwareness(clientId, userInfo, nodeIds) {
    if (!userInfo || !nodeIds) return
    // 不显示自己
    if (this.userInfo && userInfo.id === this.userInfo.id) return

    // 清除该用户之前的显示
    this._clearUserFromNodes(clientId)

    // 更新感知状态
    this.awarenessStates.set(clientId, { userInfo, nodeIds })

    // 显示用户选中的节点
    nodeIds.forEach(uid => {
      const node = this.mindMap.renderer.findNodeByUid(uid)
      if (node) {
        node.addUser(userInfo)
      } else {
        this.waitNodeUidMap[uid] = userInfo
      }
    })
  }

  // 处理感知数据同步（加入房间时）
  _handleAwarenessSync(data) {
    if (!data) return
    Object.entries(data).forEach(([clientId, state]) => {
      this._handleRemoteAwareness(clientId, state.userInfo, state.nodeIds)
    })
  }

  // 处理用户离开
  _handleAwarenessRemove(clientId) {
    this._clearUserFromNodes(clientId)
    this.awarenessStates.delete(clientId)
  }

  // 清除用户在节点上的显示
  _clearUserFromNodes(clientId) {
    const state = this.awarenessStates.get(clientId)
    if (!state) return
    const { userInfo, nodeIds } = state
    nodeIds.forEach(uid => {
      const node = this.mindMap.renderer.findNodeByUid(uid)
      if (node) {
        node.removeUser(userInfo)
      }
    })
  }

  // 绑定事件
  bindEvent() {
    // 监听思维导图改变
    this.onDataChange = this.onDataChange.bind(this)
    this.mindMap.on('data_change', this.onDataChange)

    // 监听思维导图节点激活事件
    this.onNodeActive = this.onNodeActive.bind(this)
    this.mindMap.on('node_active', this.onNodeActive)

    // 监听思维导图渲染完毕事件
    this.onNodeTreeRenderEnd = this.onNodeTreeRenderEnd.bind(this)
    this.mindMap.on('node_tree_render_end', this.onNodeTreeRenderEnd)

    // 监听设置思维导图数据事件
    this.onSetData = this.onSetData.bind(this)
    this.mindMap.on('set_data', this.onSetData)
  }

  // 解绑事件
  unBindEvent() {
    window.removeEventListener('message', this._onMessage)
    this.mindMap.off('data_change', this.onDataChange)
    this.mindMap.off('node_active', this.onNodeActive)
    this.mindMap.off('node_tree_render_end', this.onNodeTreeRenderEnd)
    this.mindMap.off('set_data', this.onSetData)
  }

  // 当前思维导图改变后的处理，触发同步
  onDataChange(data) {
    if (this.isSetData) {
      this.isSetData = false
      return
    }
    const newData = transformTreeDataToObject(data)
    this._syncChanges(newData)
  }

  // 找出变更并同步
  _syncChanges(newData) {
    const oldData = this.currentData || {}

    // 找出新增/修改的
    const changes = {}
    Object.keys(newData).forEach(uid => {
      if (!oldData[uid] || !isSameObject(oldData[uid], newData[uid])) {
        changes[uid] = newData[uid]
      }
    })

    // 找出删除的
    const deleted = []
    Object.keys(oldData).forEach(uid => {
      if (!newData[uid]) {
        deleted.push(uid)
      }
    })

    this.currentData = newData

    // 发送更新
    if (Object.keys(changes).length > 0) {
      this._postToParent({
        type: 'cooperate_update',
        roomId: this.roomId,
        changes
      })
    }

    // 发送删除
    if (deleted.length > 0) {
      this._postToParent({
        type: 'cooperate_delete',
        roomId: this.roomId,
        uids: deleted
      })
    }
  }

  // 节点激活状态改变后触发感知数据同步
  onNodeActive(node, nodeList) {
    if (!this.userInfo) return

    const nodeIdList = nodeList.map(n => n.uid)

    this._postToParent({
      type: 'cooperate_awareness',
      roomId: this.roomId,
      userInfo: this.userInfo,
      nodeIds: nodeIdList
    })
  }

  // 节点树渲染完毕事件
  onNodeTreeRenderEnd() {
    const uids = Object.keys(this.waitNodeUidMap)
    for (let i = 0; i < uids.length; i++) {
      const uid = uids[i]
      const node = this.mindMap.renderer.findNodeByUid(uid)
      if (node) {
        node.addUser(this.waitNodeUidMap[uid])
      }
    }
    this.waitNodeUidMap = {}
  }

  // 监听思维导图数据的重新设置事件
  onSetData(data) {
    this.isSetData = true
    this.initData(data)
    // 全量同步给其他客户端
    this._postToParent({
      type: 'cooperate_full_sync',
      roomId: this.roomId,
      data: this.currentData
    })
  }

  // 设置用户信息
  /**
   * {
   *    id: '',     // 必传，用户唯一的id
   *    name: '',   // 用户名称。name和avatar两个只传一个即可，如果都传了，会显示avatar
   *    avatar: '', // 用户头像
   *    color: ''   // 如果没有传头像，那么会以一个圆形来显示名称的第一个字，文字的颜色为白色，圆的颜色可以通过该字段设置
   * }
   **/
  setUserInfo(userInfo) {
    if (
      getType(userInfo) !== 'Object' ||
      isUndef(userInfo.id) ||
      (isUndef(userInfo.name) && isUndef(userInfo.avatar))
    )
      return
    this.userInfo = userInfo || null
  }

  // 断开连接
  disconnect() {
    this._postToParent({
      type: 'cooperate_disconnect',
      roomId: this.roomId
    })
    this.connected = false
  }

  // 插件被移除前做的事情
  beforePluginRemove() {
    this.unBindEvent()
    this.disconnect()
  }

  // 插件被卸载前做的事情
  beforePluginDestroy() {
    this.unBindEvent()
    this.disconnect()
  }
}

Cooperate.instanceName = 'cooperate'

export default Cooperate
