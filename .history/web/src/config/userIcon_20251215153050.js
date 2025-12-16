function generateAvatarSvg(name, color) {
  const displayName = name.length >= 2 ? name.slice(-2) : name
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="512" fill="${color}"></circle><text x="512" y="512" font-family="Arial, sans-serif" font-size="420" font-weight="bold" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${displayName}</text></svg>`
}

function stringToColor(str) {
  const colors = [
    '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63',
    '#00BCD4', '#FF5722', '#3F51B5', '#8BC34A', '#FFC107',
    '#009688', '#673AB7', '#795548', '#607D8B', '#F44336'
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

let userIconListCache = null

export async function loadUserIconList() {
  if (userIconListCache) {
    return userIconListCache
  }
  
  try {
    const response = await fetch(
      'https://test.classtorch.com/api/auth/user/list?page=1&size=1000'
    )
    const result = await response.json()
    if (result.code === 0 && Array.isArray(result.data)) {
      userIconListCache = {
        name: '用户头像',
        type: 'user_avatar',
        list: result.data
          .filter(user => user.name && user.is_del === 0)
          .map(user => ({
            name: String(user.id),
            icon: generateAvatarSvg(user.name, stringToColor(user.name))
          }))
      }
      return userIconListCache
    }
    return null
  } catch (error) {
    console.error('加载用户头像失败:', error)
    return null
  }
}

export function getUserIconListSync() {
  return userIconListCache
}

export default {
  loadUserIconList,
  getUserIconListSync
}

