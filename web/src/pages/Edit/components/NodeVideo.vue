<template>
  <el-dialog
    class="nodeVideoDialog"
    :title="$t('nodeVideo.title')"
    :visible.sync="dialogVisible"
    :width="isMobile ? '90%' : '600px'"
    :top="isMobile ? '20px' : '15vh'"
  >
    <div class="title">方式一</div>
    <VideoUpload
      ref="videoUpload"
      v-model="video"
      @upload-start="handleUploadStart"
      @upload-end="handleUploadEnd"
      style="margin-bottom: 12px;"
    ></VideoUpload>
    <div class="title">方式二</div>
    <div class="inputBox">
      <span class="label">请输入视频地址</span>
      <el-input
        v-model="videoUrl"
        size="mini"
        placeholder="http://xxx.com/xx.mp4"
        @keydown.native.stop
      ></el-input>
    </div>
    <div class="title">可选</div>
    <div class="inputBox">
      <span class="label">{{ $t('nodeVideo.videoTitle') }}</span>
      <el-input
        v-model="videoTitle"
        size="mini"
        @keydown.native.stop
      ></el-input>
    </div>
    <span slot="footer" class="dialog-footer">
      <el-button size="mini" @click="cancel" :disabled="buttonLoading">{{ $t('dialog.cancel') }}</el-button>
      <el-button size="mini" type="primary" @click="confirm" :loading="buttonLoading">{{
        $t('dialog.confirm')
      }}</el-button>
    </span>
  </el-dialog>
</template>

<script>
import VideoUpload from '@/components/VideoUpload/index.vue'
import { isMobile } from 'simple-mind-map/src/utils/index'

export default {
  components: {
    VideoUpload
  },
  data() {
    return {
      dialogVisible: false,
      video: '',
      videoUrl: '',
      videoTitle: '',
      activeNodes: null,
      isMobile: isMobile(),
      loading: false,
      isUploading: false
    }
  },
  computed: {
    // 按钮的 loading 状态：上传中或确认中
    buttonLoading() {
      return this.isUploading || this.loading
    }
  },
  watch: {
    isVideoUploading(val) {
      // 当视频正在上传时，禁用确定按钮
      if (val) {
        this.loading = true
      } else {
        this.loading = false
      }
    }
  },
  created() {
    this.$bus.$on('node_active', this.handleNodeActive)
    this.$bus.$on('showNodeVideo', this.handleShowNodeVideo)
  },
  beforeDestroy() {
    this.$bus.$off('node_active', this.handleNodeActive)
    this.$bus.$off('showNodeVideo', this.handleShowNodeVideo)
  },
  methods: {
    handleNodeActive(...args) {
      this.activeNodes = [...args[1]]
    },

    handleShowNodeVideo() {
      this.reset()
      if (this.activeNodes.length > 0) {
        const firstNode = this.activeNodes[0]
        const video = firstNode.getData('video') || ''
        if (video) {
          if (/^https?:\/\//.test(video) && !video.includes('/mindmap/')) {
            this.videoUrl = video
          } else {
            this.video = video
          }
        }
        this.videoTitle = firstNode.getData('videoTitle') || ''
      }
      this.dialogVisible = true
    },

    cancel() {
      this.dialogVisible = false
      this.reset()
    },

    reset() {
      this.video = ''
      this.videoTitle = ''
      this.videoUrl = ''
      this.loading = false
      this.isUploading = false
    },

    handleUploadStart() {
      this.isUploading = true
    },

    handleUploadEnd() {
      this.isUploading = false
    },

    async confirm() {
      // 如果正在上传，提示用户等待
      if (this.isUploading) {
        this.$message && this.$message.warning('视频正在上传中，请稍候...')
        return
      }

      if (this.loading) return

      try {
        this.loading = true
        const video = this.video || this.videoUrl

        // 如果输入的是 URL，添加一个短暂的延迟以显示 loading
        if (this.videoUrl && video) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }

        const mindMap = this.activeNodes[0] && this.activeNodes[0].mindMap
        this.activeNodes.forEach(node => {
          node.setData({
            video: video || '',
            videoTitle: video ? this.videoTitle : ''
          })
          if (typeof node.reRender === 'function') {
            node.reRender()
          }
        })
        if (mindMap && typeof mindMap.render === 'function') {
          mindMap.render()
        }
        this.cancel()
      } catch (error) {
        console.error('设置视频失败:', error)
        this.$message && this.$message.error('设置视频失败，请重试')
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="less" scoped>
.nodeVideoDialog {
  .title {
    font-size: 18px;
    margin-bottom: 12px;
  }

  .inputBox {
    display: flex;
    align-items: center;
    margin-bottom: 10px;

    .label {
      width: 150px;
    }
  }
}
</style>
