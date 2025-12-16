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
      iframeFunction: null,
      mindMapName: '',
      mindMapContent: null,
      online: { count: 0, users: [] },
      backupInterval: null,

      // 同步状态
      sync: {
        localVersion: 0,
        lastKnownState: null,
        lastSyncTime: 0,
        isRemoteUpdating: false,
      },

      // 协同编辑
      cooperateRoomId: null,

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
    // 还原版本
    async restoreVersion(item) {
      try {
        if (!item.id) {
          this.$message.error('获取记录id失败');
          return;
        }
        const content = await this.getMindMapHistory(item.id);
        const data = unzipAsObj(content);
        this.iframeFunction.mindMap.setFullData(data.mindMapData);
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
      if (!this.socket.isConnected) {
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
            this.waitForMindMapReady().then(() => {
              this.socket.send(JSON.stringify({ type: 'ready', user_id: this.userId }));
            });
          }
        },
        onMessage: (event) => {
          try {
            const message = JSON.parse(event.data);
            const { type, user_id } = message;
            const isSelf = user_id === this.userId;

            if (['join', 'leave'].includes(type) && !isSelf) {
              this.getOnlineUsers();
            }

            // 处理协同消息 - 转发给 iframe
            if (type === 'cooperate' && !isSelf) {
              this.handleCooperateMessage(message);
            }
          } catch (error) {
            console.error('WebSocket消息处理失败:', error);
          }
        },
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
    },
    async activeSave() {
      await this.iframeFunction?.activeSave();
    },
    async upload(data) {
      if (this.isPublic) return { type: 'warning', message: '分享页面不支持保存' };
      if (!this.socket.isConnected) return { type: 'warning', message: '当前页面用户连接已断开，请刷新后再试～' };

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
    waitForMindMapReady() {
      return new Promise((resolve) => {
        const checkReady = () => {
          if (this.iframeFunction?.mindMap && !this.iframeFunction._isApplyingRemoteData) {
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
    },
    registerIframeFunction() {
      window.getMindMapContent = this.getMindMapContent;
      window.upload = this.upload;
      window.sendSyncData = this.sendSyncData;
      window.copyLink = this.copyLink;
      window.isPublic = this.isPublic;
    },
    iframeDestroy() {
      this.iframeFunction?.mindMap?.destroy();

      const iframe = this.$refs.mindmap;
      if (iframe) {
        iframe.src = 'about:blank';
        iframe.parentNode?.removeChild(iframe);
      }
    },
    // 处理远程同步消息
    handleRemoteSync(message) {
      const { syncType, data, compressed, user_id } = message;

      if (!user_id || user_id === this.userId) return;
      if (this.sync.isRemoteUpdating) return;

      // 解压数据
      let actualData = data;
      if (compressed) {
        try {
          actualData = unzipAsObj(data);
        } catch (error) {
          console.error('解压失败:', error);
          return;
        }
      }

      if (syncType === 'data_change' || syncType === 'initial_data') {
        this.applyRemoteData(actualData);
      }
    },

    // 应用远程数据
    applyRemoteData(data) {
      if (!this.iframeFunction?.mindMap) return;

      this.sync.isRemoteUpdating = true;
      this.status = 'SYNCING';

      try {
        // 保存当前状态
        this.sync.lastKnownState = this.iframeFunction.mindMap.getData(true);

        if (this.iframeFunction.syncManager) {
          this.iframeFunction.syncManager.pause();
        }

        // 应用数据
        const strategies = [
          () => this.iframeFunction.mindMap.updateData(data.mindMapData),
          () => this.iframeFunction.mindMap.setFullData(data.mindMapData),
        ];

        for (const strategy of strategies) {
          try {
            strategy();
            this.$nextTick(() => (this.status = 'SAVED'));
            break;
          } catch (error) {
            if (strategy === strategies[strategies.length - 1]) throw error;
          }
        }
      } catch (error) {
        console.error('应用远程数据失败:', error);
        this.rollbackToLastState();
      } finally {
        setTimeout(() => {
          this.sync.isRemoteUpdating = false;
          if (this.iframeFunction?.syncManager) {
            this.iframeFunction.syncManager.resume();
          }
        }, 500);
      }
    },

    // 回滚到最后已知状态
    rollbackToLastState() {
      if (this.sync.lastKnownState && this.iframeFunction?.mindMap) {
        try {
          this.iframeFunction.mindMap.setData(this.sync.lastKnownState);
          this.status = 'ERROR';
          this.$nextTick(() => (this.status = 'SAVED'));
        } catch (error) {
          this.$message.error('数据同步异常，建议刷新页面');
        }
      }
    },

    // 发送同步数据
    sendSyncData(syncType, data, forceSync = false) {
      if (!forceSync && this.online.count <= 1) return;
      if (!this.socket?.isConnected) return;
      if (this.sync.isRemoteUpdating) return;

      try {
        this.sync.localVersion++;
        const message = {
          type: 'mindmap_sync',
          syncType,
          data: zipAsStr(data),
          compressed: true,
          user_id: this.userId,
          mindmap_id: this.mindMapId,
          timestamp: Date.now(),
          version: this.sync.localVersion,
        };

        this.sync.lastSyncTime = Date.now();
        this.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error('发送同步数据失败:', error);
      }
    },

    // 发送当前数据给新用户
    sendCurrentDataToNewUser() {
      if (!this.iframeFunction?.mindMap) return;

      try {
        const fullData = {
          mindMapData: this.iframeFunction.mindMap.getData(true),
          lang: this.iframeFunction.takeOverAppMethods.getLanguage(),
        };
        this.sendSyncData('initial_data', fullData, true);
      } catch (error) {
        console.error('发送当前数据失败:', error);
      }
    },
    updateContainerHeight() {
      this.containerHeight = this.isPublic ? `${window.innerHeight}px` : `${window.innerHeight - 201}px`;
    },

    init() {
      this.connectWs();
      this.updateContainerHeight();
      this.registerIframeFunction();
      this.startBackupInterval();
      window.addEventListener('resize', this.updateContainerHeight);

      const iframe = this.$refs.mindmap;
      if (iframe) {
        this.iframeFunction = iframe.contentWindow;
        const isPublicParam = this.isPublic ? '&isPublic=1' : '';
        const newSrc = `/mindmap/mindmap.html?id=${this.mindMapId}&t=${Date.now()}${isPublicParam}`;
        if (iframe.src !== newSrc) iframe.src = newSrc;
      }
    },
    destroy() {
      this.closeWs();
      this.iframeDestroy();
      if (this.backupInterval) clearInterval(this.backupInterval);
      window.removeEventListener('resize', this.updateContainerHeight);
      window.getMindMapContent = null;
      window.upload = null;
      window.sendSyncData = null;
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

.title-area {
  display: flex;
  align-items: center;
}

.back-btn {
  padding: 0;
  font-size: 14px;
}

.title-divider {
  width: 1px;
  height: 16px;
  background-color: #dcdfe6;
  margin: 0 10px;
}

.title {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.status-area {
  display: flex;
  align-items: center;
  margin-left: 15px;
}

.header-right {
  display: flex;
  align-items: center;
}

.action-divider {
  width: 1px;
  height: 14px;
  background-color: #dcdfe6;
  margin: 0 10px;
}

.save-btn {
  color: #606266;
  font-size: 13px;
  padding: 0;
}

.save-btn:hover {
  color: #409eff;
  background-color: transparent;
}

.status-indicators {
  display: flex;
  align-items: center;
}

.status-item {
  display: flex;
  align-items: center;
  font-size: 13px;
}

.status-item span {
  margin-left: 4px;
}

.loading {
  color: #409eff;
}

.backuping {
  color: #e6a23c;
}

.saved {
  color: #67c23a;
}

.syncing {
  color: grey;
}

.mindmap-container {
  width: auto;
  position: relative;
  border-radius: 4px;
  overflow: hidden;
}
.public-page .mindmap-container {
  width: 100%;
  height: 100%;
  border-radius: 0;
  position: absolute;
  top: 0;
  left: 0;
}
.online-btn {
  padding: 0;
  font-size: 13px;
}

.log-content {
  padding: 0 15px 20px 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.log-loading,
.log-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #909399;
  font-size: 14px;
}

.log-loading i,
.log-empty i {
  font-size: 24px;
  margin-bottom: 10px;
}

.log-list {
  flex: 1;
  overflow-y: auto;
}

.log-list::-webkit-scrollbar {
  width: 6px;
}

.log-list::-webkit-scrollbar-track {
  background: transparent;
}

.log-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background 0.3s ease;
}

.log-content:hover .log-list::-webkit-scrollbar-thumb {
  background: rgba(144, 147, 153, 0.6);
}

.log-list::-webkit-scrollbar-thumb:hover {
  background: rgba(144, 147, 153, 0.8);
}

.log-item {
  padding: 15px 0;
  border-bottom: 1px solid #f0f0f0;
  position: relative;

  &:hover .log-actions {
    opacity: 1;
    visibility: visible;
  }
}

.log-item-last {
  border-bottom: none;
}

.log-time {
  font-size: 13px;
  color: #409eff;
  font-weight: 500;
  margin-bottom: 8px;
}

.log-info {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}

.log-user {
  margin-bottom: 4px;
}

.log-action {
  color: #909399;
}

.log-pagination {
  text-align: center;
  padding: 15px 0;
  border-top: 1px solid #f0f0f0;
  margin-top: 10px;
}

.log-loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 15px 0;
  color: #909399;
  font-size: 13px;
}

.log-loading-more i {
  margin-right: 5px;
}

.log-actions {
  position: absolute;
  top: 8px;
  right: 10px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.log-item:hover .log-actions {
  opacity: 1;
}

.action-btn {
  width: 24px !important;
  height: 24px !important;
  padding: 0 !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 14px !important;
  transition: all 0.2s ease !important;
  border: none !important;
  background: rgba(255, 255, 255, 0.9) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
}

.action-btn:hover {
  transform: scale(1.1) !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15) !important;
}

.restore-btn {
  color: #409eff !important;
}

.restore-btn:hover {
  background: #409eff !important;
  color: white !important;
}

.delete-btn {
  color: #f56c6c !important;
}

.delete-btn:hover {
  background: #f56c6c !important;
  color: white !important;
}

.action-btn.is-loading {
  pointer-events: none;
  opacity: 0.7;
}
</style>

<style>
.mini-button-message-box .el-button {
  padding: 7px 15px;
  font-size: 12px;
  border-radius: 3px;
  height: 28px;
  line-height: 1;
}

body:has(.main.public-page) {
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}

html:has(.main.public-page) {
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}

.public-mindmap-fullscreen {
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}

.main.public-page,
.public-mindmap-fullscreen .main.public-page {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  z-index: 9999 !important;
}

.main.public-page.el-main,
.public-mindmap-fullscreen .main.public-page.el-main {
  padding: 0 !important;
  max-height: none !important;
  overflow: hidden !important;
}
</style>
