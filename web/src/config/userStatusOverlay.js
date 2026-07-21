export const userStatusOptions = [
  { type: 'rdSuccess', shortLabel: 'RD ✓', env: 'RD', envColor: '#1769E0', resultColor: '#16A34A' },
  { type: 'rdFailed', shortLabel: 'RD ✗', env: 'RD', envColor: '#1769E0', resultColor: '#DC2626' },
  { type: 'pdSuccess', shortLabel: 'PD ✓', env: 'PD', envColor: '#7C3AED', resultColor: '#16A34A' },
  { type: 'pdFailed', shortLabel: 'PD ✗', env: 'PD', envColor: '#7C3AED', resultColor: '#DC2626' }
]

// 半圆覆盖层：头像底部叠加彩色半圆 + RD/PD 文字
export function generateStatusOverlaySvg(userIconSvg, env, resultColor) {
  const innerMatch = userIconSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
  const innerContent = innerMatch ? innerMatch[1] : userIconSvg
  const clipId = `usc_${Math.random().toString(36).slice(2, 9)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    ${innerContent}
    <clipPath id="${clipId}">
      <rect x="0" y="65" width="100" height="35" />
    </clipPath>
    <g clip-path="url(#${clipId})">
      <circle cx="50" cy="50" r="48" fill="${resultColor}" />
    </g>
    <text x="50" y="86" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">${env}</text>
  </svg>`
}

// 从节点数据中扫描 userStatus_* 图标，生成 status group 用于初始化 iconList
export function buildUserStatusIconGroup(rootData, userIconGroups) {
  const userIconMap = {}
  userIconGroups.forEach(group => {
    if (group.type.startsWith('user') && group.type !== 'userStatus') {
      group.list.forEach(user => {
        if (!userIconMap[user.name]) {
          userIconMap[user.name] = user.icon
        }
      })
    }
  })

  const list = []
  const seen = new Set()

  function walk(node) {
    const icons = node.data && node.data.icon
    if (Array.isArray(icons)) {
      icons.forEach(key => {
        if (key.startsWith('userStatus_') && !seen.has(key)) {
          seen.add(key)
          const namePart = key.split('_')[1]
          const dashIdx = namePart.lastIndexOf('-')
          const uid = namePart.slice(0, dashIdx)
          const statusType = namePart.slice(dashIdx + 1)
          const userSvg = userIconMap[uid]
          const opt = userStatusOptions.find(s => s.type === statusType)
          if (userSvg && opt) {
            list.push({
              name: namePart,
              icon: generateStatusOverlaySvg(userSvg, opt.env, opt.resultColor)
            })
          }
        }
      })
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(walk)
    }
  }
  walk(rootData)

  return list.length > 0 ? { name: '用户执行状态', type: 'userStatus', list } : null
}
