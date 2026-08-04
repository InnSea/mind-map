<template>
  <div class="fullscreenContainer" :class="{ isDark: isDark }">
    <el-tooltip
      class="item"
      effect="dark"
      :content="$t('fullscreen.fullscreenShow')"
      placement="top"
    >
      <div class="btn iconfont iconquanping" @click="toFullscreenShow"></div>
    </el-tooltip>
    <el-tooltip
      class="item"
      effect="dark"
      :content="$t('fullscreen.fullscreenEdit')"
      placement="top"
    >
      <div class="btn iconfont iconquanping1" @click="toFullscreenEdit"></div>
    </el-tooltip>
  </div>
</template>

<script>
import { fullscrrenEvent, fullScreen } from '@/utils'

// 全屏
export default {
  props: {
    mindMap: {
      type: Object
    },
    isDark: {
      type: Boolean
    }
  },
  data() {
    return {}
  },
  created() {
    document[fullscrrenEvent] = () => {
      setTimeout(() => {
        if (!this.mindMap || !this.mindMap.el) return
        const { width, height } = this.mindMap.el.getBoundingClientRect()
        if (width <= 0 || height <= 0) return
        this.mindMap.resize()
      }, 1000)
    }
  },
  methods: {
    // 全屏查看
    toFullscreenShow() {
      fullScreen(this.mindMap.el)
    },

    // 全屏编辑
    toFullscreenEdit() {
      fullScreen(document.body)
    }
  }
}
</script>

<style lang="less" scoped>
.fullscreenContainer {
  display: flex;
  align-items: center;

  &.isDark {
    .btn {
      color: hsla(0,0%,100%,.6);
    }
  }

  .item {
    margin-right: 20px;

    &:last-of-type {
      margin-right: 0;
    }
  }

  .btn {
    cursor: pointer;
  }
}
</style>
