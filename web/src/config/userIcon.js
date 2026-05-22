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

function generateAvatarSvg(name, color) {
  const displayName = name.length >= 2 ? name.slice(-2) : name
  const gradientId = `grad_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Math.random()
    .toString(36)
    .slice(2, 11)}`
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
        <text x="50" y="50" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="central">${displayName}</text>
      </svg>`
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

export default async function loadUserIconList() {
  try {
    const [userResponse, groupResponse] = await Promise.all([
      fetch('https://test.classtorch.com/api/auth/user/list?page=1&size=1000'),
      fetch('https://test.classtorch.com/api/auth/group/all')
    ])
    const userResult = await userResponse.json()
    const groupResult = await groupResponse.json()

    if (userResult.code !== 0 || !Array.isArray(userResult.data)) return []

    const users = userResult.data.filter(
      user => user.name && user.is_valid && user.is_del === 0
    )

    const groups =
      groupResult.code === 0 && Array.isArray(groupResult.data)
        ? groupResult.data
        : []

    const groupMap = new Map(groups.map(g => [g.id, g.name]))

    const grouped = {}
    users.forEach(user => {
      const gid = user.group_id || 0
      if (!grouped[gid]) grouped[gid] = []
      grouped[gid].push({
        uid: user.id,
        name: user.name,
        icon: generateAvatarSvg(user.name, stringToColor(user.name))
      })
    })

    const result = []
    const entries = Object.entries(grouped).sort(([a], [b]) => {
      if (a === '0') return 1
      if (b === '0') return -1
      return Number(a) - Number(b)
    })
    for (const [gid, list] of entries) {
      const groupName = groupMap.get(Number(gid)) || '未分组'
      result.push({
        name: `${groupName} - 用户图标`,
        type: `userGroup${gid}`,
        list: list.map(item => ({
          name: String(item.uid),
          text: item.name,
          icon: item.icon
        }))
      })
    }
    // 兼容老数据：老节点保存的引用是 user_<uid>，需要 type: 'user' 的分组才能命中
    result.push({
      name: '全部用户',
      type: 'user',
      list: users.map(user => ({
        name: String(user.id),
        text: user.name,
        icon: generateAvatarSvg(user.name, stringToColor(user.name))
      }))
    })
    return result
  } catch (error) {
    console.error('加载用户头像失败:', error)
    return []
  }
}
