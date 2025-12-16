

async loadUserIconList({ commit, state }) {
    if (state.userIconList.length > 0) {
      return state.userIconList
    }
    try {
      const response = await fetch(
        'https://test.classtorch.com/api/auth/user/list?page=1&size=1000'
      )
      const result = await response.json()
      if (result.code === 0 && Array.isArray(result.data)) {
        const iconList = result.data
          .filter(user => user.name && user.is_del === 0)
          .map(user => generateAvatarSvg(user.name, stringToColor(user.name)))
        commit('setUserIconList', iconList)
        return iconList
      }
      return []
    } catch (error) {
      console.error('加载用户头像失败:', error)
      return []
    }
  }