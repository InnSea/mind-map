<template>
    <div class="main" :class="{ 'public-page': isPublic }">
      <div class="header" v-if="!isPublic">
        <div class="header-left">
          <div class="title-area">
            <el-button type="text" icon="el-icon-back" @click="back" class="back-btn">返回</el-button>
            <div class="title-divider"></div>
            <span class="title">{{ mindMapName }}</span>
          </div>
          <div class="status-area" v-if="!loading">
            <div v-show="status === 'SAVING'" class="status-item loading">
              <i class="el-icon-loading" />
              <span>保存中...</span>
            </div>
            <div v-show="status === 'BACKUPING'" class="status-item backuping">
              <i class="el-icon-loading" />
              <span>备份中...</span>
            </div>
            <div v-show="status === 'SAVED'" class="status-item saved">
              <i class="el-icon-success" />
              <span>已保存</span>
            </div>
            <div v-show="status === 'SYNCING'" class="status-item syncing">
              <i class="el-icon-loading" />
              <span>同步中...</span>
            </div>
          </div>
        </div>
        <div class="header-right">
          <el-button class="online-btn" type="text" size="mini" icon="el-icon-view" @click="getMindMapLog">
            操作记录</el-button
          >
          <div class="action-divider"></div>
          <el-popover
            placement="top-start"
            width="200"
            trigger="hover"
            :content="online.users.map((user) => `${user.name}`).join(', ') || '暂无用户'"
          >
            <el-button class="online-btn" type="text" slot="reference">
              <i class="el-icon-user"></i> 在线人数: {{ online.count }}
            </el-button>
          </el-popover>
        </div>
      </div>
      <div class="mindmap-container" v-loading="loading">
        <iframe
          ref="mindmap"
          src="/mindmap/mindmap.html"
          frameborder="0"
          width="100%"
          :height="containerHeight"
          @load="iframeLoaded"
        />
      </div>
  
      <el-drawer
        title="操作记录"
        :visible.sync="logDrawerVisible"
        direction="rtl"
        size="400px"
        :before-close="handleLogDrawerClose"
      >
        <div class="log-content">
          <div v-if="logLoading" class="log-loading">
            <i class="el-icon-loading"></i>
            <span>加载中...</span>
          </div>
          <div v-else-if="logList.length === 0" class="log-empty">
            <i class="el-icon-document"></i>
            <span>暂无操作记录</span>
          </div>
          <div v-else class="log-list" ref="logList" @scroll="handleLogScroll">
            <div
              v-for="(item, index) in logList"
              :key="item.id"
              class="log-item"
              :class="{ 'log-item-last': index === logList.length - 1 }"
            >
              <div class="log-time">
                {{ item.operate_time }} <StatusTag :defaultType="'success'" size="mini" :hit="true" text="保存" />
              </div>
              <div class="log-info">
                <div class="log-user">操作用户: {{ item.user_id | userNameFilter }}</div>
              </div>
              <div class="log-actions">
                <el-popconfirm title="确定要还原到此版本吗？" @confirm="restoreVersion(item)">
                  <el-button
                    slot="reference"
                    type="text"
                    icon="el-icon-refresh-left"
                    size="mini"
                    class="action-btn restore-btn"
                    title="还原版本"
                  />
                </el-popconfirm>
                <el-popconfirm
                  title="确定要删除此记录吗？"
                  @confirm="deleteRecord(item)"
                  icon="el-icon-info"
                  icon-color="red"
                  size="mini"
                >
                  <el-button
                    slot="reference"
                    type="text"
                    icon="el-icon-delete"
                    size="mini"
                    class="action-btn delete-btn"
                    title="删除"
                  />
                </el-popconfirm>
              </div>
            </div>
            <div v-if="loadingMore" class="log-loading-more">
              <i class="el-icon-loading"></i>
              <span>加载更多中...</span>
            </div>
          </div>
        </div>
      </el-drawer>
    </div>
  </template>
  
  <script>
  import {
    getMindMapContent,
    mindMapBackup,
    mindMapUpload,
    getOnline,
    mindMapEdit,
    getLog,
    getHistory,
    deleteLog,
  } from '@/api/mindmap';
  import { WebSocketInstance } from '@/utils/http/websockets.js';
  import { zipAsStr, unzipAsObj } from '@/utils/common/zipHelper';
  import { getUserList } from '@/utils/common/filters';
  
  export default {
    name: 'MindMapDetail',
    computed: {
      mindMapId() {
        return +this.$route.params.id;
      },
      userId() {
        const user = JSON.parse(localStorage.getItem('userInfo'));
        return +user?.user?.id || null;
      },
      userName() {
        const user = JSON.parse(localStorage.getItem('userInfo'));
        return user?.user?.name || `用户${this.userId}`;
      },
      isPublic() {
        return this.$route.name === 'PublicMindMap';
      },
    },
    watch: {
      mindMapName(newName) {
        if (newName) {
          document.title = `${newName} - 用例导图`;
        }
      },
      $route(to, from) {
        if (to.params.id !== from.params.id) {
          this.$nextTick(() => {
            this.init();
          });
        }
      },
      'socket.isConnected'(newVal, oldVal) {
        if (newVal === false && oldVal === true) {
          this.notificationInstance = this.$notify.error({
            title: '用户连接错误',
            message: '当前用户ws连接已断开，请刷新页面～',
            duration: 0,
          });
          this.getOnlineUsers();
          this.closeWs();
          this.loading = true;
          // 通知 iframe 断开连接
          this.postToIframe({ type: 'disconnected' });
        }
      },
    },
    data() {
      return {
        userList: getUserList(),
        loading: true,
        status: 'SAVED',
        containerHeight: '75vh',
        socket: null,
        iframeWindow: null,
        mindMapName: '',
        mindMapContent: null,
        online: { count: 0, users: [] },
        backupInterval: null,
  
        // 协同相关
        cooperate: {
          roomId: null,
          currentData: {}, // 当前的平级对象数据
          isRemoteUpdating: false,
        },
  
        notificationInstance: null,
        logPage: 1,
        logSize: 20,
        logDrawerVisible: false,
        logLoading: false,
        logList: [],
        logTotal: 0,
        loadingMore: false,
      };
    },
    methods: {
      // ==================== postMessage 通信 ====================
  
      // 发送消息给 iframe
      postToIframe(data) {
        if (!this.iframeWindow) return;
        this.iframeWindow.postMessage(
          {
            source: 'cooperate-parent',
            ...data,
          },
          '*',
        );
      },
  
      // 监听 iframe 消息
      onIframeMessage(event) {
        const data = event.data;
        if (!data || data.source !== 'mindmap-cooperate') return;
  
        const { type, roomId } = data;
  
        switch (type) {
          case 'cooperate_connect':
            // iframe 请求连接协同
            this.cooperate.roomId = roomId;
            if (this.socket?.isConnected) {
              this.postToIframe({ type: 'connected' });
              // 发送当前协同数据（如果有）
              if (Object.keys(this.cooperate.currentData).length > 0) {
                this.postToIframe({
                  type: 'init',
                  data: this.cooperate.currentData,
                });
              }
            }
            break;
  
          case 'cooperate_disconnect':
            // iframe 断开协同
            this.cooperate.roomId = null;
            break;
  
          case 'cooperate_update':
            // iframe 发送节点更新
            this.handleLocalUpdate(data.changes);
            break;
  
          case 'cooperate_delete':
            // iframe 发送节点删除
            this.handleLocalDelete(data.uids);
            break;
  
          case 'cooperate_full_sync':
            // iframe 发送全量同步
            this.handleLocalFullSync(data.data);
            break;
  
          case 'cooperate_awareness':
            // iframe 发送感知数据
            this.handleLocalAwareness(data.userInfo, data.nodeIds);
            break;
        }
      },
  
      // ==================== 本地操作 → WebSocket ====================
  
      // 处理本地更新
      handleLocalUpdate(changes) {
        if (!changes || Object.keys(changes).length === 0) return;
  
        // 更新本地数据
        Object.assign(this.cooperate.currentData, changes);
  
        // 发送到 WebSocket
        this.sendToWebSocket({
          type: 'update',
          changes,
        });
      },
  
      // 处理本地删除
      handleLocalDelete(uids) {
        if (!uids || uids.length === 0) return;
  
        // 更新本地数据
        uids.forEach((uid) => delete this.cooperate.currentData[uid]);
  
        // 发送到 WebSocket
        this.sendToWebSocket({
          type: 'delete',
          uids,
        });
      },
  
      // 处理本地全量同步
      handleLocalFullSync(data) {
        if (!data) return;
  
        // 更新本地数据
        this.cooperate.currentData = data;
  
        // 发送到 WebSocket
        this.sendToWebSocket({
          type: 'full_sync',
          data,
        });
      },
  
      // 处理本地感知数据
      handleLocalAwareness(userInfo, nodeIds) {
        this.sendToWebSocket({
          type: 'awareness',
          userInfo,
          nodeIds,
        });
      },
  
      // 发送消息到 WebSocket
      sendToWebSocket(message) {
        if (!this.socket?.isConnected) return;
        if (this.cooperate.isRemoteUpdating) return;
  
        try {
          this.socket.send(
            JSON.stringify({
              ...message,
              user_id: this.userId,
              mindmap_id: this.mindMapId,
              timestamp: Date.now(),
            }),
          );
        } catch (error) {
          console.error('发送 WebSocket 消息失败:', error);
        }
      },
  
      // ==================== WebSocket → iframe ====================
  
      // 处理 WebSocket 消息
      handleWebSocketMessage(event) {
        try {
          const message = JSON.parse(event.data);
          const { type, user_id } = message;
          const isSelf = user_id === this.userId;
  
          // 用户加入/离开
          if (['join', 'leave'].includes(type) && !isSelf) {
            this.getOnlineUsers();
            return;
          }
  
          // 新用户准备好了，发送当前数据
          if (type === 'ready' && !isSelf) {
            this.sendCurrentDataToNewUser();
            return;
          }
  
          // 协同消息（来自其他用户）
          if (!isSelf) {
            this.handleRemoteCooperateMessage(message);
          }
        } catch (error) {
          console.error('WebSocket 消息处理失败:', error);
        }
      },
  
      // 处理远程协同消息
      handleRemoteCooperateMessage(message) {
        const { type } = message;
  
        this.cooperate.isRemoteUpdating = true;
        this.status = 'SYNCING';
  
        try {
          switch (type) {
            case 'update':
              // 更新本地数据
              Object.assign(this.cooperate.currentData, message.changes);
              // 转发给 iframe
              this.postToIframe({
                type: 'update',
                changes: message.changes,
              });
              break;
  
            case 'delete':
              // 更新本地数据
              message.uids?.forEach((uid) => delete this.cooperate.currentData[uid]);
              // 转发给 iframe
              this.postToIframe({
                type: 'delete',
                uids: message.uids,
              });
              break;
  
            case 'full_sync':
              // 更新本地数据
              this.cooperate.currentData = message.data || {};
              // 转发给 iframe
              this.postToIframe({
                type: 'full_sync',
                data: message.data,
              });
              break;
  
            case 'init':
              // 初始化数据（新用户加入时收到）
              this.cooperate.currentData = message.data || {};
              this.postToIframe({
                type: 'init',
                data: message.data,
              });
              break;
  
            case 'awareness':
              // 转发感知数据给 iframe
              this.postToIframe({
                type: 'awareness',
                clientId: message.clientId || `${message.user_id}`,
                userInfo: message.userInfo,
                nodeIds: message.nodeIds,
              });
              break;
  
            case 'awareness_remove':
              // 用户离开，清除感知数据
              this.postToIframe({
                type: 'awareness_remove',
                clientId: message.clientId || `${message.user_id}`,
              });
              break;
          }
        } finally {
          setTimeout(() => {
            this.cooperate.isRemoteUpdating = false;
            this.status = 'SAVED';
          }, 300);
        }
      },
  
      // 发送当前数据给新用户
      sendCurrentDataToNewUser() {
        if (Object.keys(this.cooperate.currentData).length === 0) return;
  
        this.sendToWebSocket({
          type: 'init',
          data: this.cooperate.currentData,
        });
      },
  
      // ==================== 原有方法（保持不变或微调）====================
  
      // 还原版本
      async restoreVersion(item) {
        try {
          if (!item.id) {
            this.$message.error('获取记录id失败');
            return;
          }
          const content = await this.getMindMapHistory(item.id);
          const data = unzipAsObj(content);
          // 通过 postMessage 通知 iframe 设置数据
          this.iframeWindow?.setFullData?.(data.mindMapData);
          this.$message.success('还原成功');
        } catch (error) {
          this.$message.error(`还原历史版本失败， 错误原因: ${error.message}`);
        }
      },
  
      // 删除记录
      deleteRecord(item) {
        if (!item.id) {
          this.$message.error('历史记录获取失败');
          return;
        }
        deleteLog(item.id).then(async ({ data: { code, msg } }) => {
          if (code === 0) {
            this.$message.success(msg);
            await this.getMindMapLog();
          }
        });
      },
  
      closeNotification() {
        if (this.notificationInstance) {
          this.notificationInstance.close();
          this.notificationInstance = null;
        }
      },
  
      async getMindMapHistory(id) {
        const {
          data: { code, data },
        } = await getHistory(id);
        return code === 0 ? data : null;
      },
  
      async getMindMapLog() {
        this.logDrawerVisible = true;
        this.logLoading = true;
        this.logList = [];
        this.logTotal = 0;
        this.logPage = 1;
  
        try {
          const {
            data: { code, data, total },
          } = await getLog(this.mindMapId, this.logPage, this.logSize);
          if (code === 0) {
            this.logList = data || [];
            this.logTotal = total || 0;
          }
        } catch (error) {
          this.$message.error('获取操作记录异常');
        } finally {
          this.logLoading = false;
        }
      },
  
      handleLogDrawerClose() {
        this.logDrawerVisible = false;
        this.logPage = 1;
        this.logList = [];
        this.logTotal = 0;
      },
  
      async loadMoreLogs() {
        if (this.loadingMore || this.logList.length >= this.logTotal) return;
  
        this.loadingMore = true;
        this.logPage++;
  
        try {
          const {
            data: { code, data },
          } = await getLog(this.mindMapId, this.logPage, this.logSize);
          if (code === 0) {
            this.logList.push(...(data || []));
          } else {
            this.$message.error('加载更多记录失败');
            this.logPage--;
          }
        } catch (error) {
          this.$message.error('加载更多记录异常');
          this.logPage--;
        } finally {
          this.loadingMore = false;
        }
      },
  
      handleLogScroll(event) {
        const { scrollTop, scrollHeight, clientHeight } = event.target;
        if (scrollHeight - scrollTop - clientHeight < 50) {
          this.loadMoreLogs();
        }
      },
  
      copyLink() {
        this.$copyText(`${window.location.origin}/#/public/mindmap/${this.mindMapId}`).then(
          () => {
            this.$message.success('复制成功');
          },
          () => {
            this.$message.error('复制失败');
          },
        );
      },
  
      async back() {
        if (!this.socket?.isConnected) {
          this.closeNotification();
          this.$router.push({ name: 'MindMap' });
          return;
        }
        const loadingInstance = this.$loading({
          lock: true,
          text: '正在保存...',
          spinner: 'el-icon-loading',
          background: 'rgba(255, 255, 255, 0.7)',
          target: '.mindmap-container',
        });
        await this.activeSave();
        this.closeWs();
        this.$router.push({ name: 'MindMap' });
        loadingInstance.close();
      },
  
      connectWs() {
        if (this.isPublic) return;
  
        this.socket = WebSocketInstance.connectWebSocket({
          url: `${this.$wsBaseUrl}/api/mindmap/${this.userId}/${this.mindMapId}`,
          onOpen: () => {
            if (this.socket) {
              this.socket.send(JSON.stringify({ type: 'join', user_id: this.userId }));
              this.getOnlineUsers();
              // 通知 iframe 已连接
              this.postToIframe({ type: 'connected' });
              // 等待 iframe 准备好后发送 ready
              this.waitForIframeReady().then(() => {
                this.socket.send(JSON.stringify({ type: 'ready', user_id: this.userId }));
              });
            }
          },
          onMessage: this.handleWebSocketMessage.bind(this),
          autoReconnect: false,
          heartbeat: true,
          heartbeatInterval: 30000,
        });
      },
  
      closeWs() {
        if (this.socket) {
          this.socket.send(JSON.stringify({ type: 'leave', user_id: this.userId }));
          this.socket.close();
          this.socket = null;
        }
        // 通知 iframe 断开
        this.postToIframe({ type: 'disconnected' });
      },
  
      async activeSave() {
        // 通过 iframe 暴露的方法保存
        await this.iframeWindow?.activeSave?.();
      },
  
      async upload(data) {
        if (this.isPublic) return { type: 'warning', message: '分享页面不支持保存' };
        if (!this.socket?.isConnected) return { type: 'warning', message: '当前页面用户连接已断开，请刷新后再试～' };
  
        try {
          this.status = 'SAVING';
          const layout = data?.mindMapData?.layout || 'logicalStructure';
  
          this.mindMapContent = {
            id: this.mindMapId,
            content: zipAsStr(data),
            structure: layout,
          };
  
          const [uploadRes, editRes] = await Promise.all([
            mindMapUpload(this.mindMapContent),
            mindMapEdit({ id: this.mindMapId, name: this.mindMapName, structure: layout }),
          ]);
  
          if (uploadRes.data.code === 0 && editRes.data.code === 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            this.status = 'SAVED';
            return { type: 'success', message: '保存成功' };
          }
  
          this.status = 'ERROR';
          return { type: 'error', message: '保存失败' };
        } catch (error) {
          this.status = 'ERROR';
          return { type: 'error', message: '保存异常', error: error.message };
        }
      },
  
      async getMindMapContent() {
        try {
          const {
            data: {
              code,
              data: { content, name },
            },
          } = await getMindMapContent(this.mindMapId);
          if (code === 0) {
            this.mindMapName = name;
            return unzipAsObj(content);
          }
        } finally {
          this.loading = false;
        }
      },
  
      backup() {
        if (this.isPublic || !this.mindMapContent?.content) return;
  
        this.status = 'BACKUPING';
        mindMapBackup(this.mindMapContent)
          .catch(() => this.$message.error('备份失败'))
          .finally(() => setTimeout(() => (this.status = 'SAVED'), 500));
      },
  
      async getOnlineUsers() {
        if (this.isPublic) return;
  
        const {
          data: {
            code,
            data: { online },
          },
        } = await getOnline(this.mindMapId);
        if (code === 0) {
          this.online.count = Object.keys(online).length;
          this.online.users = Object.values(online).map((userId) => {
            const user = this.userList.find((u) => u.id === +userId);
            return { name: user?.name || '-' };
          });
        }
      },
  
      waitForIframeReady() {
        return new Promise((resolve) => {
          const checkReady = () => {
            if (this.iframeWindow && !this.loading) {
              resolve();
            } else {
              setTimeout(checkReady, 50);
            }
          };
          checkReady();
        });
      },
  
      startBackupInterval() {
        if (this.isPublic) return;
        this.backupInterval = setInterval(() => this.backup(), 60000);
      },
  
      iframeLoaded() {
        this.updateContainerHeight();
        this.iframeWindow = this.$refs.mindmap?.contentWindow;
      },
  
      registerIframeFunction() {
        window.getMindMapContent = this.getMindMapContent;
        window.upload = this.upload;
        window.copyLink = this.copyLink;
        window.isPublic = this.isPublic;
        // 移除 sendSyncData，现在通过 postMessage 通信
      },
  
      iframeDestroy() {
        this.iframeWindow = null;
  
        const iframe = this.$refs.mindmap;
        if (iframe) {
          iframe.src = 'about:blank';
          iframe.parentNode?.removeChild(iframe);
        }
      },
  
      updateContainerHeight() {
        this.containerHeight = this.isPublic ? `${window.innerHeight}px` : `${window.innerHeight - 201}px`;
      },
  
      init() {
        // 监听 iframe 消息
        window.addEventListener('message', this.onIframeMessage.bind(this));
  
        this.connectWs();
        this.updateContainerHeight();
        this.registerIframeFunction();
        this.startBackupInterval();
        window.addEventListener('resize', this.updateContainerHeight);
  
        const iframe = this.$refs.mindmap;
        if (iframe) {
          this.iframeWindow = iframe.contentWindow;
          const isPublicParam = this.isPublic ? '&isPublic=1' : '';
          // 添加协同所需的参数
          const newSrc = `/mindmap/mindmap.html?roomId=${this.mindMapId}&userId=${this.userId}&userName=${encodeURIComponent(this.userName)}&t=${Date.now()}${isPublicParam}`;
          if (iframe.src !== newSrc) iframe.src = newSrc;
        }
      },
  
      destroy() {
        window.removeEventListener('message', this.onIframeMessage);
        this.closeWs();
        this.iframeDestroy();
        if (this.backupInterval) clearInterval(this.backupInterval);
        window.removeEventListener('resize', this.updateContainerHeight);
        window.getMindMapContent = null;
        window.upload = null;
        window.copyLink = null;
        window.isPublic = null;
      },
    },
    mounted() {
      this.init();
      if (this.isPublic) {
        document.body.classList.add('public-mindmap-fullscreen');
        document.documentElement.classList.add('public-mindmap-fullscreen');
      }
    },
    beforeDestroy() {
      this.destroy();
      if (this.isPublic) {
        document.body.classList.remove('public-mindmap-fullscreen');
        document.documentElement.classList.remove('public-mindmap-fullscreen');
      }
    },
  };
  </script>
  
  <style scoped lang="less">
  .main {
    margin-top: 10px;
  
    &.public-page {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-height: none !important;
      background-color: #f5f5f5;
      z-index: 9999;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    background-color: #f5f7fa;
    padding: 10px 15px;
    border-radius: 4px;
  }
  
  .header-left {
    display: flex;
    align-items: center;
  }
  
  .title-area