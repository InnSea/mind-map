export default {
    data() {
      return {
        externalEnvironment: {
          isReady: false,
          isPublic: false,
          methods: {
            activeSave: null,
            copyLink: null
          },
          cooperateConfig: null
        }
      }
    },
  
    created() {
      this.initExternalEnvironment();
    },
  
    methods: {
      initExternalEnvironment() {
        this.checkExternalEnvironment();
      },
  
      checkExternalEnvironment() {
        if (this.isExternalMethodsReady()) {
          this.externalEnvironment.isReady = true;
          this.externalEnvironment.isPublic = window.isPublic;
          this.externalEnvironment.methods.activeSave = window.activeSave;
          this.externalEnvironment.methods.copyLink = window.copyLink;
          this.externalEnvironment.cooperateConfig = window.cooperateConfig || null;
          
          this.$bus.$emit('external_environment_ready', this.externalEnvironment);
        } else {
          setTimeout(() => {
            this.checkExternalEnvironment();
          }, 200);
        }
      },
  
      isExternalMethodsReady() {
        return !!(window.activeSave && window.copyLink && window.isPublic !== undefined);
      },
  
      callExternalSave() {
        if (this.externalEnvironment.methods.activeSave) {
          return this.externalEnvironment.methods.activeSave();
        }
      },
  
      callExternalCopyLink() {
        if (this.externalEnvironment.methods.copyLink) {
          return this.externalEnvironment.methods.copyLink();
        }
      },

      // getCooperateConfig() {
      //   return this.externalEnvironment.cooperateConfig;
      // },

      // setCooperateConfig(config) {
      //   this.externalEnvironment.cooperateConfig = config;
      //   if (window.cooperateConfig !== undefined) {
      //     window.cooperateConfig = config;
      //   }
      //   this.$bus.$emit('cooperate_config_changed', config);
      // },

      // // 获取协作提供者配置
      // getCooperateProviderConfig() {
      //   const config = this.getCooperateConfig();
      //   if (config && config.provider) {
      //     return config.provider;
      //   }
      //   // 返回默认配置
      //   return {
      //     roomName: 'demo-room',
      //     signalingList: ['ws://localhost:4444']
      //   };
      // },

      // // 获取协作用户配置
      // getCooperateUserConfig() {
      //   const config = this.getCooperateConfig();
      //   if (config && config.user) {
      //     return config.user;
      //   }
      //   // 返回默认配置
      //   return {
      //     colors: ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399'],
      //     defaultAvatar: 'https://img0.baidu.com/it/u=4270674549,2416627993&fm=253&app=138&size=w931&n=0&f=JPEG&fmt=auto?sec=1696006800&t=4d32871d14a7224a4591d0c3c7a97311'
      //   };
      // }
    }
  }