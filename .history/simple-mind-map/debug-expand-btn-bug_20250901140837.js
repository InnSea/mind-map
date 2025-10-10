/**
 * 调试代码：触发展开收起按钮位置更新bug
 * 使用方法：在浏览器控制台中运行此代码
 */

// 调试函数：快速添加和删除节点来触发bug
function triggerExpandBtnBug(mindMap) {
  if (!mindMap || !mindMap.renderer) {
    console.error('请先初始化思维导图实例');
    return;
  }

  console.log('开始触发展开收起按钮位置更新bug...');
  
  // 获取根节点
  const root = mindMap.renderer.root;
  if (!root) {
    console.error('未找到根节点');
    return;
  }

  // 确保根节点有子节点
  if (root.children.length === 0) {
    mindMap.execCommand('INSERT_CHILD_NODE', false, [root], {
      text: '测试节点1'
    });
  }

  const targetNode = root.children[0];
  
  // 步骤1：给目标节点添加一个子节点（这样会显示展开收起按钮）
  console.log('步骤1：添加子节点...');
  mindMap.execCommand('INSERT_CHILD_NODE', false, [targetNode], {
    text: '子节点1'
  });
  
  setTimeout(() => {
    // 步骤2：快速连续添加多个子节点
    console.log('步骤2：快速添加多个子节点...');
    for (let i = 2; i <= 5; i++) {
      mindMap.execCommand('INSERT_CHILD_NODE', false, [targetNode], {
        text: `子节点${i}`
      });
    }
    
    setTimeout(() => {
      // 步骤3：快速删除一些子节点
      console.log('步骤3：快速删除子节点...');
      const childrenToRemove = targetNode.children.slice(1, 3); // 删除第2和第3个子节点
      mindMap.execCommand('REMOVE_NODE', childrenToRemove);
      
      setTimeout(() => {
        // 步骤4：再次添加节点
        console.log('步骤4：再次添加节点...');
        mindMap.execCommand('INSERT_CHILD_NODE', false, [targetNode], {
          text: '新子节点'
        });
        
        console.log('bug触发完成！请检查展开收起按钮位置是否正确。');
        
        // 检查按钮位置
        setTimeout(() => {
          checkExpandBtnPosition(targetNode);
        }, 100);
      }, 50);
    }, 50);
  }, 100);
}

// 检查展开收起按钮位置的函数
function checkExpandBtnPosition(node) {
  if (!node._expandBtn) {
    console.log('节点没有展开收起按钮');
    return;
  }
  
  const btnTransform = node._expandBtn.transform();
  const nodeRect = node.group.bbox();
  
  console.log('节点信息：', {
    width: node.width,
    height: node.height,
    nodeRect: nodeRect,
    btnPosition: {
      x: btnTransform.translateX,
      y: btnTransform.translateY
    }
  });
  
  // 根据布局类型检查按钮位置是否合理
  const layout = node.mindMap.opt.layout;
  let expectedX, expectedY;
  
  switch (layout) {
    case 'logicalStructure':
    case 'mindMap':
      expectedX = node.width;
      expectedY = node.height / 2;
      break;
    case 'organizationStructure':
      expectedX = node.width / 2;
      expectedY = node.height;
      break;
    default:
      console.log('未知布局类型，跳过位置检查');
      return;
  }
  
  const tolerance = 5; // 允许的误差范围
  const isPositionCorrect = 
    Math.abs(btnTransform.translateX - expectedX) <= tolerance &&
    Math.abs(btnTransform.translateY - expectedY) <= tolerance;
  
  if (isPositionCorrect) {
    console.log('✅ 展开收起按钮位置正确');
  } else {
    console.log('❌ 展开收起按钮位置异常！');
    console.log('期望位置：', { x: expectedX, y: expectedY });
    console.log('实际位置：', { x: btnTransform.translateX, y: btnTransform.translateY });
  }
}

// 自动化测试函数
function autoTestExpandBtnBug(mindMap, iterations = 3) {
  console.log(`开始自动化测试，将进行 ${iterations} 轮测试...`);
  
  let currentIteration = 0;
  
  function runIteration() {
    if (currentIteration >= iterations) {
      console.log('自动化测试完成！');
      return;
    }
    
    currentIteration++;
    console.log(`\n=== 第 ${currentIteration} 轮测试 ===`);
    
    triggerExpandBtnBug(mindMap);
    
    // 等待当前轮测试完成后开始下一轮
    setTimeout(() => {
      runIteration();
    }, 1000);
  }
  
  runIteration();
}

// 使用说明
console.log(`
展开收起按钮位置bug调试工具已加载！

使用方法：
1. 单次测试：triggerExpandBtnBug(mindMap)
2. 自动化测试：autoTestExpandBtnBug(mindMap, 5)
3. 检查按钮位置：checkExpandBtnPosition(node)

其中 mindMap 是你的思维导图实例
`);

// 导出函数供外部使用
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = {
    triggerExpandBtnBug,
    checkExpandBtnPosition,
    autoTestExpandBtnBug
  };
}

// 如果在浏览器环境中，将函数挂载到全局对象
if (typeof window !== 'undefined') {
  window.debugExpandBtnBug = {
    triggerExpandBtnBug,
    checkExpandBtnPosition,
    autoTestExpandBtnBug
  };
}