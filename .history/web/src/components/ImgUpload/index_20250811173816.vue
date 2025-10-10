<template>
  <div class="imgUploadContainer">
    <div class="imgUploadPanel">
      <div class="upBtn" v-if="!value">
        <label
          for="imgUploadInput"
          class="imgUploadInputArea"
          @dragenter.stop.prevent
          @dragover.stop.prevent
          @drop.stop.prevent="onDrop"
          >点击此处选择图片、或拖动图片到此</label
        >
        <input
          type="file"
          accept="image/*"
          id="imgUploadInput"
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
import { convertToWebP } from 'simple-mind-map/src/utils/index'

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
      file: null
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
        // 转换为 WebP 格式以减少文件大小
        const optimizedBlob = await convertToWebP(file)
        
        // 转换为 base64
        const reader = new FileReader()
        reader.onload = e => {
          this.$emit('change', e.target.result)
        }
        reader.onerror = () => {
          // 出错时使用原始文件
          this.fallbackToOriginal(file)
        }
        reader.readAsDataURL(optimizedBlob)
      } catch (error) {
        console.warn('WebP 转换失败，使用原始文件:', error)
        this.fallbackToOriginal(file)
      }
    },

    // 回退到原始文件处理
    fallbackToOriginal(file) {
      const reader = new FileReader()
      reader.onload = e => {
        this.$emit('change', e.target.result)
      }
      reader.readAsDataURL(file)
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
</style>
