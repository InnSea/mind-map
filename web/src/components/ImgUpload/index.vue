<template>
  <div class="imgUploadContainer">
    <div class="imgUploadPanel">
      <div class="upBtn" v-if="!value">
        <label
          for="imgUploadInput"
          class="imgUploadInputArea"
          :class="{ uploading: isUploading }"
          @dragenter.stop.prevent
          @dragover.stop.prevent
          @drop.stop.prevent="onDrop"
          >
          <span v-if="!isUploading">点击此处选择图片、或拖动图片到此</span>
          <span v-else>
            <i class="el-icon-loading"></i>
            正在上传图片...
          </span>
        </label>
        <input
          type="file"
          accept="image/*"
          id="imgUploadInput"
          :disabled="isUploading"
          @change="onImgUploadInputChange"
        />
      </div>
      <div v-if="value" class="uploadInfoBox">
        <div
          class="previewBox"
          :style="{ backgroundImage: `url('${value}')` }"
        ></div>
        <span class="delBtn el-icon-close" @click="deleteImg"></span>
      </div>
    </div>
  </div>
</template>

<script>
import { uploadImage } from '@/api/upload'

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
    // 图片选择事件
    onImgUploadInputChange(e) {
      let file = e.target.files[0]
      this.selectImg(file)
    },

    // 拖动上传图片
    onDrop(e) {
      let dt = e.dataTransfer
      let file = dt.files && dt.files[0]
      this.selectImg(file)
    },

    // 选择图片
    async selectImg(file) {
      this.file = file
      
      try {
        // 显示加载状态
        this.isUploading = true
        
        // 上传到服务器
        const imageUrl = await this.uploadToServer(file)
        
        // 返回服务器图片 URL
        this.$emit('change', imageUrl)
      } catch (error) {
        console.error('图片上传失败:', error)
        this.$message && this.$message.error('图片上传失败，请重试')
      } finally {
        this.isUploading = false
      }
    },

    // 上传图片到服务器
    async uploadToServer(file) {
      return await uploadImage(file)
    },

    // 获取图片大小
    getSize() {
      return new Promise(resolve => {
        let img = new Image()
        img.src = this.value
        img.onload = () => {
          resolve({
            width: img.width,
            height: img.height
          })
        }
        img.onerror = () => {
          resolve({
            width: 0,
            height: 0
          })
        }
      })
    },

    // 删除图片
    deleteImg() {
      this.$emit('change', '')
      this.file = null
    }
  }
}
</script>

<style lang="less" scoped>
@import './style.less';

.imgUploadContainer {
  .imgUploadPanel {
    .upBtn {
      .imgUploadInputArea {
        &.uploading {
          opacity: 0.6;
          cursor: not-allowed;
          
          i {
            margin-right: 5px;
          }
        }
      }
    }
  }
}
</style>
