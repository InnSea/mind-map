import store from '@/store'

// 加载用户图标列表（使用 Vuex action）
export async function loadUserIconList() {
  return store.dispatch('loadUserIconList')
}

export default loadUserIconList
