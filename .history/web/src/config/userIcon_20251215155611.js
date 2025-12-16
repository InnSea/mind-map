function generateAvatarSvg(name, color) {
  const displayName = name.length >= 2 ? name.slice(-2) : name
  const gradientId = `grad_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Math.random()
    .toString(36)
    .substr(2, 9)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${adjustColor(
            color,
            -30
          )};stop-opacity:1" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#${gradientId})" stroke="#fff" stroke-width="2"/>
      <text x="50" y="50" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="central">${displayName}</text>
    </svg>`
}

function adjustColor(color, amount) {
  const hex = color.replace('#', '')
  const r = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(0, 2), 16) + amount)
  )
  const g = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(2, 4), 16) + amount)
  )
  const b = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(4, 6), 16) + amount)
  )
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function stringToColor(str) {
  const colors = [
    '#4CAF50',
    '#2196F3',
    '#9C27B0',
    '#FF9800',
    '#E91E63',
    '#00BCD4',
    '#FF5722',
    '#3F51B5',
    '#8BC34A',
    '#FFC107',
    '#009688',
    '#673AB7',
    '#795548',
    '#607D8B',
    '#F44336'
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


loadUserIconList)_