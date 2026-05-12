<template>
  <div class="videoUploadContainer">
    <div class="videoUploadPanel">
      <div class="upBtn" v-if="!value">
        <label
          for="videoUploadInput"
          class="videoUploadInputArea"
          :class="{ uploading: isUploading }"
          @dragenter.stop.prevent
          @dragover.stop.prevent
          @drop.stop.prevent="onDrop"
        >
          <span v-if="!isUploading">点击此处选择视频、或拖动视频到此</span>
          <span v-else>
            <i class="el-icon-loading"></i>
            正在上传视频...
          </span>
        </label>
        <input
          type="file"
          accept="video/*"
          id="videoUploadInput"
          :disabled="isUploading"
          @change="onVideoUploadInputChange"
        />
      </div>
      <div v-if="value" class="uploadInfoBox">
        <video class="previewVideo" :src="value" controls preload="metadata"></video>
        <span class="delBtn el-icon-close" @click="deleteVideo"></span>
      </div>
    </div>
  </div>
</template>

<script>
import { uploadVideo } from '@/api/upload'

export default {
  model: {
    prop: 'value',
    event: 'change'
  },
  props: {
    value: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      file: null,
      isUploading: false
    }
  },
  methods: {
    onVideoUploadInputChange(e) {
      let file = e.target.files[0]
      this.selectVideo(file)
    },

    onDrop(e) {
      let dt = e.dataTransfer
      let file = dt.files && dt.files[0]
      this.selectVideo(file)
    },

    async selectVideo(file) {
      if (!file) return
      this.file = file
      try {
        this.isUploading = true
        this.$emit('upload-start')
        const videoUrl = await this.uploadToServer(file)
        this.$emit('change', videoUrl)
        this.$emit('upload-success')
      } catch (error) {
        console.error('视频上传失败:', error)
        this.$message && this.$message.error('视频上传失败，请重试')
        this.$emit('upload-error', error)
      } finally {
        this.isUploading = false
        this.$emit('upload-end')
      }
    },

    async uploadToServer(file) {
      return await uploadVideo(file)
    },

    deleteVideo() {
      this.$emit('change', '')
      this.file = null
    }
  }
}
</script>

<style lang="less" scoped>
@import './style.less';

.videoUploadContainer {
  .videoUploadPanel {
    .videoUploadInputArea {
      &.uploading {
        opacity: 0.6;
        cursor: not-allowed;

        i {
          margin-right: 5px;
        }
      }
    }

    .uploadInfoBox {
      .previewVideo {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    }
  }
}
</style>
