<template>
  <div
    class="nodeVideoStyleContainer"
    ref="elRef"
    :style="position"
    v-show="show"
    :class="{ isDark: isDark }"
  >
    <div class="videoPreview" v-if="videoUrl">
      <video
        v-if="isVideoFile"
        :src="videoUrl"
        controls
        style="width: 100%; max-height: 300px;"
      ></video>
      <div v-else class="videoLink">
        <span class="iconfont iconshipin"></span>
        <span class="text">{{ videoTitle || '视频' }}</span>
      </div>
    </div>
    <div class="actions">
      <el-button
        size="mini"
        @click="playVideo"
        v-if="!isVideoFile"
      >
        {{ $t('nodeVideo.play') }}
      </el-button>
      <el-button
        size="mini"
        @click="editVideo"
      >
        {{ $t('nodeVideo.edit') }}
      </el-button>
      <el-button
        size="mini"
        type="danger"
        @click="deleteVideo"
      >
        {{ $t('nodeVideo.delete') }}
      </el-button>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      show: false,
      position: {
        left: 0,
        top: 0
      },
      node: null,
      videoUrl: '',
      videoTitle: ''
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    }),
    isVideoFile() {
      if (!this.videoUrl) return false
      return /\.(mp4|webm|ogg|mov)$/i.test(this.videoUrl)
    }
  },
  created() {
    this.mindMap.on('node_video_click', this.onNodeVideoClick)
    this.mindMap.on('scale', this.hide)
    this.mindMap.on('translate', this.hide)
    this.mindMap.on('svg_mousedown', this.hide)
    this.mindMap.on('expand_btn_click', this.hide)
  },
  beforeDestroy() {
    this.mindMap.off('node_video_click', this.onNodeVideoClick)
    this.mindMap.off('scale', this.hide)
    this.mindMap.off('translate', this.hide)
    this.mindMap.off('svg_mousedown', this.hide)
    this.mindMap.off('expand_btn_click', this.hide)
  },
  mounted() {
    document.body.appendChild(this.$refs.elRef)
  },
  methods: {
    onNodeVideoClick(node, e, el) {
      this.node = node
      this.videoUrl = node.getData('video') || ''
      this.videoTitle = node.getData('videoTitle') || ''

      const { x, y, width, height } = el.rbox()
      const boxWidth = 320
      const boxHeight = this.isVideoFile ? 400 : 180
      let left = x + width / 2 - boxWidth / 2
      if (left < 0) {
        left = 0
      }
      if (left + boxWidth > window.innerWidth) {
        left = window.innerWidth - boxWidth
      }
      this.position.left = left + 'px'
      let top = y + height + 5
      if (top + boxHeight > window.innerHeight) {
        top = window.innerHeight - boxHeight
      }
      this.position.top = top + 'px'
      this.show = true
    },

    playVideo() {
      if (this.videoUrl) {
        window.open(this.videoUrl, '_blank')
      }
    },

    editVideo() {
      this.hide()
      this.$bus.$emit('showNodeVideo')
    },

    deleteVideo() {
      if (!this.node) return
      this.node.setData({
        video: '',
        videoTitle: ''
      })
      if (typeof this.node.reRender === 'function') {
        this.node.reRender()
      }
      const mindMap = this.node.mindMap
      if (mindMap && typeof mindMap.render === 'function') {
        mindMap.render()
      }
      this.hide()
    },

    hide() {
      this.show = false
      this.node = null
      this.videoUrl = ''
      this.videoTitle = ''
    }
  }
}
</script>

<style lang="less" scoped>
.nodeVideoStyleContainer {
  position: fixed;
  width: 320px;
  padding: 12px;
  background-color: #fff;
  border-radius: 5px;
  box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.06);
  z-index: 9999;

  &.isDark {
    background-color: #262a2e;
    border-color: hsla(0, 0%, 100%, 0.1);
  }

  .videoPreview {
    margin-bottom: 12px;

    .videoLink {
      display: flex;
      align-items: center;
      padding: 10px;
      background: #f5f7fa;
      border-radius: 4px;

      .iconfont {
        font-size: 20px;
        color: #409eff;
        margin-right: 8px;
      }

      .text {
        font-size: 14px;
        color: #606266;
      }
    }
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
}
</style>

