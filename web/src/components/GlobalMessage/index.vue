<template>
  <div class="m-message-wrap" :style="`top: ${top}px;`">
    <div class="m-message" v-for="(item, index) in messageContent" :key="index">
      <transition name="slide-fade" :key="index">
        <div
          class="m-message-content"
          @mouseenter="onEnter(index)"
          @mouseleave="onLeave(index)"
          v-if="showMessage[index]"
        >
          <svg
            class="svg"
            v-if="item.mode === 'info'"
            :style="{ fill: colorStyle[item.mode] }"
            viewBox="64 64 896 896"
            data-icon="info-circle"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272zm-32-344a48.01 48.01 0 0 1 0-96 48.01 48.01 0 0 1 0 96z"
            ></path>
          </svg>
          <svg
            class="svg"
            v-if="item.mode === 'success'"
            :style="{ fill: colorStyle[item.mode] }"
            viewBox="64 64 896 896"
            data-icon="check-circle"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 0 0 1-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.2 0 19.9 4.9 25.9 13.3l71.2 98.8 157.2-218c6-8.3 15.6-13.3 25.9-13.3H699c6.5 0 10.3 7.4 6.5 12.7z"
            ></path>
          </svg>
          <svg
            class="svg"
            v-if="item.mode === 'error'"
            :style="{ fill: colorStyle[item.mode] }"
            viewBox="64 64 896 896"
            data-icon="close-circle"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm165.4 618.2l-66-.3L512 563.4l-99.3 118.4-66.1.3c-4.4 0-8-3.5-8-8 0-1.9.7-3.7 1.9-5.2l130.1-155L340.5 359a8.32 8.32 0 0 1-1.9-5.2c0-4.4 3.6-8 8-8l66.1.3L512 464.6l99.3-118.4 66-.3c4.4 0 8 3.5 8 8 0 1.9-.7 3.7-1.9 5.2L553.5 514l130 155c1.2 1.5 1.9 3.3 1.9 5.2 0 4.4-3.6 8-8 8z"
            ></path>
          </svg>
          <svg
            class="svg"
            v-if="item.mode === 'warn'"
            :style="{ fill: colorStyle[item.mode] }"
            viewBox="64 64 896 896"
            data-icon="exclamation-circle"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm-32 232c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V296zm32 440a48.01 48.01 0 0 1 0-96 48.01 48.01 0 0 1 0 96z"
            ></path>
          </svg>
          <p class="content">{{ item.content }}</p>
        </div>
      </transition>
    </div>
  </div>
</template>
<script>
import { debounce } from 'lodash-es';

const colorStyle = {
  info: '#1890FF',
  success: '#52c41a',
  error: '#f5222d',
  warn: '#faad14',
}; // 颜色主题对象

export default {
  name: 'myMessage',
  props: {
    duration: {
      // 自动关闭的延时,单位ms
      type: Number,
      default: 2000,
    },
    top: {
      // 消息距离顶部的位置，单位px
      type: Number,
      default: 20,
    },
  },
  data() {
    return {
      colorStyle,
      mode: 'info',
      resetTimer: null,
      showMessage: [],
      hideTimers: [],
      messageContent: [],
      messageItem: [],
    };
  },
  computed: {
    clear() {
      return this.showMessage.every((item) => !item);
    },
  },
  watch: {
    clear: debounce(function (to, from) {
      if (!from && to) {
        this.messageContent.splice(0);
        this.showMessage.splice(0);
        this.messageItem.splice(0);
      }
    }, 500),
  },
  methods: {
    onEnter(index) {
      clearTimeout(this.hideTimers[index]);
    },
    onLeave(index) {
      this.onHideMessage(index);
    },
    show(content, mode, duration = this.duration) {
      clearTimeout(this.resetTimer);
      const item = { content, mode };
      this.messageContent.push(item);
      const index = this.messageContent.length - 1;
      this.$nextTick(() => {
        this.$set(this.showMessage, index, true);
        this.$set(this.messageItem, index, item);
        this.onHideMessage(index, duration);
      });
    },
    info(content) {
      this.show(content, 'info');
    },
    success(content) {
      this.show(content, 'success');
    },
    error(content) {
      this.show(content, 'error');
    },
    warn(content) {
      this.show(content, 'warn');
    },
    onHideMessage(index, duration = this.duration) {
      this.hideTimers[index] = setTimeout(() => {
        this.$set(this.showMessage, index, false);
      }, duration);
    },
  },
};
</script>

<style lang="less" scoped>
// 渐变过渡效果
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter,
.fade-leave-to {
  opacity: 0;
}

// 滑动渐变过渡效果
.slide-fade-enter-active {
  transition: all 0.5s ease;
}

.slide-fade-leave-active {
  transition: all 0.5s ease;
}

.slide-fade-enter,
.slide-fade-leave-to {
  transform: translateY(-16px);
  -ms-transform: translateY(-16px);
  -webkit-transform: translateY(-16px);
  opacity: 0;
}

.m-message-wrap {
  position: fixed;
  z-index: 9999;
  width: 100vw;
  left: 0;
  right: 0;
  pointer-events: none;

  .m-message {
    text-align: center;

    .m-message-content {
      margin: 8px 0;
      display: inline-block;
      padding: 10px 16px;
      background: #fff;
      border-radius: 7px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      pointer-events: auto;

      .svg {
        width: 16px;
        height: 16px;
        margin-right: 8px;
        position: relative;
        top: 2px;
      }

      .content {
        display: inline-block;
        font-size: 14px;
        color: rgba(0, 0, 0, 0.65);
        line-height: 20px;
      }
    }
  }
}
</style>
