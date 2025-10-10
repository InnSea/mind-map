import GlobalMessage from '@/components/GlobalMessage';

const MessagePlugin = {
  install(Vue) {
    const MessageComponent = Vue.extend(GlobalMessage);
    const messageInstance = new MessageComponent({
      propsData: {
        top: 85
      }
    });

    const mountPoint = document.createElement('div');
    document.body.appendChild(mountPoint);
    messageInstance.$mount(mountPoint);
    
    Vue.prototype.$message = {
      show: (content, mode, duration) => messageInstance.show(content, mode, duration),
      info: (content, duration) => messageInstance.show(content, 'info', duration),
      success: (content, duration) => messageInstance.show(content, 'success', duration),
      error: (content, duration) => messageInstance.show(content, 'error', duration),
      warning: (content, duration) => messageInstance.show(content, 'warn', duration),
    };
  },
};

export default MessagePlugin;
