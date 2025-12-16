import store from '@/store'

export async function loadUserIconList() {
  return store.dispatch('loadUserIconList')
}

export default loadUserIconList
