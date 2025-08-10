<template>
    <div class="text-processor">
      <a-card title="文本处理器" :bordered="false">
        <!-- 工具栏 -->
        <div class="toolbar" style="margin-bottom: 16px">
          <a-space>
            <a-upload
              :show-upload-list="false"
              :before-upload="handleFileUpload"
              accept=".txt"
              :custom-request="() => {}"
            >
              <a-button type="primary" :icon="h(UploadOutlined)">
                加载TXT文件
              </a-button>
            </a-upload>
            
            <a-button 
              @click="downloadFile" 
              :disabled="!textContent"
              :icon="h(DownloadOutlined)"
            >
              下载文件
            </a-button>
            
            <a-button 
              @click="clearText" 
              :disabled="!textContent"
              :icon="h(DeleteOutlined)"
            >
              重置内容
            </a-button>
            
            
            
            <a-dropdown>
              <a-button 
                :disabled="!textContent"
                :icon="h(ToolOutlined)"
                type="primary"
              >
                一键处理
                <DownOutlined />
              </a-button>
              <template #overlay>
                <a-menu @click="handleProcessMenuClick">
                  <a-menu-item key="call-api">调用处理接口（含AI）</a-menu-item>
                  <a-menu-item key="call-api-no-ai">调用处理接口（不含AI）</a-menu-item>
                  <a-sub-menu key="traditional" title="转成繁体">
                    <a-menu-item key="s2t">s2t（简体→繁体）</a-menu-item>
                    <a-menu-item key="s2tw">s2tw（简体→繁体-台湾）</a-menu-item>
                    <a-menu-item key="s2hk">s2hk（简体→繁体-香港）</a-menu-item>
                    <a-menu-item key="s2twp">s2twp（简体→繁体-台湾含常用词）</a-menu-item>
                  </a-sub-menu>
                  <a-sub-menu key="simplified" title="转成简体">
                    <a-menu-item key="t2s">t2s（繁体→简体）</a-menu-item>
                  </a-sub-menu>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
          
          <div style="margin-left: auto">
            <a-tag v-if="fileName" color="blue">
              当前文件: {{ fileName }}
            </a-tag>
          </div>
        </div>

        
        
        <!-- 文本编辑区域（Ace Editor） -->
        <div class="editor-wrapper">
          <div class="editor-container" ref="editorContainerRef"></div>
          <div class="stats-panel">
            <div class="stats-panel-header">
              <a-menu 
                mode="horizontal" 
                :selected-keys="[currentPanel]" 
                @click="switchPanel"
                class="panel-menu"
              >
                <a-menu-item key="long-lines">
                  <span>长句统计</span>
                  <a-tag color="orange" style="margin-left: 4px;">{{ longLinesCount }}</a-tag>
                </a-menu-item>
                <a-menu-item key="title-numbers">
                  <span>标题编号</span>
                  <a-tag color="blue" style="margin-left: 4px;">{{ titleNumbersCount }}</a-tag>
                </a-menu-item>
              </a-menu>
            </div>
            
            <!-- 长句统计面板 -->
            <div v-if="currentPanel === 'long-lines'" class="panel-content">
              <div class="long-lines-list">
                <div 
                  v-for="line in longLines" 
                  :key="line.lineNumber"
                  class="long-line-item"
                  @click="scrollToLine(line.lineNumber)"
                  :title="`点击跳转到第 ${line.lineNumber + 1} 行`"
                >
                  <span class="line-number">{{ line.lineNumber + 1 }}</span>
                  <span class="line-preview">{{ line.preview }}</span>
                  <span class="line-length">{{ line.length }}字</span>
                </div>
                <div v-if="longLines.length === 0" class="no-data">
                  没有超过35字的行
                </div>
              </div>
            </div>
            
            <!-- 标题编号推测面板 -->
            <div v-if="currentPanel === 'title-numbers'" class="panel-content">
              <div class="title-numbers-list">
                <div 
                  v-for="title in titleNumbers" 
                  :key="title.lineNumber"
                  class="title-item"
                  @click="scrollToLine(title.lineNumber)"
                  :title="`点击跳转到第 ${title.lineNumber + 1} 行`"
                >
                  <span class="title-number">{{ title.number }}</span>
                  <span class="title-text">{{ title.text }}</span>
                  <span class="title-type">{{ title.type }}</span>
                </div>
                <div v-if="titleNumbers.length === 0" class="no-data">
                  没有检测到标题编号
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 统计信息 -->
        <div class="stats" style="margin-top: 16px">
          <a-space>
            <a-tag>字符数: {{ charCount }}</a-tag>
            <a-tag>行数: {{ lineCount }}</a-tag>
            <a-tag>单词数: {{ wordCount }}</a-tag>
            <a-tag v-if="fileName" color="blue">文件: {{ fileName }}</a-tag>
          </a-space>
        </div>
      </a-card>
    </div>
  </template>
  
  <script>
  import { ref, h, nextTick, watch, onMounted, onUnmounted } from 'vue'
  import ace from 'ace-builds/src-noconflict/ace'
  import 'ace-builds/src-noconflict/ext-language_tools'
  import 'ace-builds/src-noconflict/theme-textmate'
  import 'ace-builds/src-noconflict/mode-text'
  import 'ace-builds/src-noconflict/ext-searchbox'
  import { 
    UploadOutlined, 
    DownloadOutlined, 
    DeleteOutlined,
    ToolOutlined,
    DownOutlined
  } from '@ant-design/icons-vue'
  import * as OpenCC from 'opencc-js'
  import { message } from 'ant-design-vue'
  
  export default {
    name: 'TextProcessor',
    setup() {
      const textContent = ref('')
      const originalContent = ref('')
      const fileName = ref('')
      const editorContainerRef = ref(null)
      const editorInstance = ref(null)

      
      // 撤销功能
      const textHistory = ref([])
      const currentHistoryIndex = ref(-1)
      
      // 查找替换相关
      const searchText = ref('')
      const replaceText = ref('')
      const matchCount = ref(0)
      const currentMatchIndex = ref(-1)
      const hasSelection = ref(false)
      const matchRanges = ref([]) // Ace range info
      const matchDecorations = ref([])
      const currentMatchDecorations = ref([])
      const isSettingModelValue = ref(false)
      let historySaveTimer = null
      
      // 文本统计信息（使用防抖更新，避免每次输入都全量扫描）
      const charCount = ref(0)
      const lineCount = ref(0)
      const wordCount = ref(0)
      const longLines = ref([])
      const longLinesCount = ref(0)
      const titleNumbers = ref([])
      const titleNumbersCount = ref(0)
      const currentPanel = ref('long-lines')
      let updateStatsTimer = null
      const recomputeWordCount = (text) => {
        if (!text) return 0
        // 使用与原实现一致的逻辑，但与其它统计一并防抖
        let inWord = false
        let words = 0
        for (let i = 0; i < text.length; i++) {
          const ch = text.charCodeAt(i)
          const isWhite = ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === 12 || ch === 11
          if (!isWhite) {
            if (!inWord) {
              words++
              inWord = true
            }
          } else if (inWord) {
            inWord = false
          }
        }
        return words
      }
      const updateStatsNow = () => {
        const text = editorInstance.value ? editorInstance.value.getValue() : (textContent.value || '')
        charCount.value = text.length
        let count = 0
        for (let i = 0; i < text.length; i++) {
          if (text.charCodeAt(i) === 10) count++
        }
        lineCount.value = text ? count + 1 : 0
        wordCount.value = recomputeWordCount(text)
        
        // 分析长句
        analyzeLongLines(text)
        // 分析标题编号
        analyzeTitleNumbers(text)
      }
      const scheduleUpdateStats = () => {
        if (updateStatsTimer) clearTimeout(updateStatsTimer)
        updateStatsTimer = setTimeout(updateStatsNow, 200)
      }
      
      // 监听查找文本变化，刷新高亮并定位第一个匹配
      watch(searchText, (newValue) => {
        if (newValue && textContent.value) {
          nextTick(() => {
            updateMatchCount()
            if (matchRanges.value.length > 0) {
              findFirstMatch()
            }
          })
        } else {
          clearHighlights()
        }
      })
      
      // 更新匹配数量和位置（防抖）
      let updateMatchesTimer = null
      const doUpdateMatchCount = () => {
        const editor = editorInstance.value
        if (!editor || !searchText.value || !textContent.value) {
          matchCount.value = 0
          currentMatchIndex.value = -1
          hasSelection.value = false
          matchRanges.value = []
          clearHighlights()
          return
        }

        // 在 Ace 中使用 session 文本进行简单的正则匹配，记录行列范围
        const session = editor.getSession()
        const text = session.getValue()
        const pattern = new RegExp(escapeRegExp(searchText.value), 'g')
        const ranges = []
        let match
        while ((match = pattern.exec(text)) && ranges.length < 2000) {
          const startIndex = match.index
          const endIndex = startIndex + match[0].length
          const startPos = session.doc.indexToPosition(startIndex, 0)
          const endPos = session.doc.indexToPosition(endIndex, 0)
          ranges.push({
            startRow: startPos.row,
            startCol: startPos.column,
            endRow: endPos.row,
            endCol: endPos.column
          })
        }
        matchRanges.value = ranges
        matchCount.value = ranges.length
        applyMatchDecorations()
      }
      const updateMatchCount = () => {
        if (updateMatchesTimer) clearTimeout(updateMatchesTimer)
        updateMatchesTimer = setTimeout(() => {
          doUpdateMatchCount()
        }, 120)
      }
      
      const applyMatchDecorations = () => {
        if (!editorInstance.value) return
        const session = editorInstance.value.getSession()
        // 清理旧标记
        matchDecorations.value.forEach(id => session.removeMarker(id))
        currentMatchDecorations.value.forEach(id => session.removeMarker(id))
        matchDecorations.value = []
        currentMatchDecorations.value = []
        // 需要 Range 类
        const Range = ace.require('ace/range').Range
        // 添加匹配标记
        matchRanges.value.forEach(r => {
          const id = session.addMarker(new Range(r.startRow, r.startCol, r.endRow, r.endCol), 'ace-find-match', 'text', false)
          matchDecorations.value.push(id)
        })
        // 当前匹配
        if (currentMatchIndex.value >= 0 && matchRanges.value[currentMatchIndex.value]) {
          const r = matchRanges.value[currentMatchIndex.value]
          const id = session.addMarker(new Range(r.startRow, r.startCol, r.endRow, r.endCol), 'ace-current-match', 'text', false)
          currentMatchDecorations.value.push(id)
          editorInstance.value.scrollToLine(r.startRow, true, true, function () {})
          editorInstance.value.gotoLine(r.startRow + 1, r.startCol, true)
        }
      }
      
      // 清除高亮
      const clearHighlights = () => {
        currentMatchIndex.value = -1
        hasSelection.value = false
        matchRanges.value = []
        if (editorInstance.value) {
          matchDecorations.value = editorInstance.value.deltaDecorations(matchDecorations.value, [])
          currentMatchDecorations.value = editorInstance.value.deltaDecorations(currentMatchDecorations.value, [])
        }
      }
      
      // 转义正则表达式特殊字符
      const escapeRegExp = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
      
      // 查找第一个匹配
      const findFirstMatch = () => {
        if (matchRanges.value.length > 0) {
          currentMatchIndex.value = 0
          hasSelection.value = true
          selectAndScrollToMatch(0)
        }
      }
      
      // 选择并滚动到指定匹配
      const selectAndScrollToMatch = (matchIndex) => {
        if (matchIndex < 0 || matchIndex >= matchRanges.value.length) return
        const range = matchRanges.value[matchIndex]
        if (!editorInstance.value) return
        editorInstance.value.setSelection(range)
        editorInstance.value.revealRangeInCenter(range)
        currentMatchIndex.value = matchIndex
        hasSelection.value = true
        applyMatchDecorations()
      }
      
      // 滚动到匹配位置

      
      // 查找下一个
      const findNext = () => {
        if (!searchText.value || matchRanges.value.length === 0) return
        
        let nextIndex = currentMatchIndex.value + 1
        if (nextIndex >= matchRanges.value.length) {
          nextIndex = 0 // 循环到第一个
          message.info('已回到开头继续查找')
        }
        
        currentMatchIndex.value = nextIndex
        hasSelection.value = true
        selectAndScrollToMatch(nextIndex)
      }
      
      // 查找上一个
      const findPrev = () => {
        if (!searchText.value || matchRanges.value.length === 0) return
        
        let prevIndex = currentMatchIndex.value - 1
        if (prevIndex < 0) {
          prevIndex = matchRanges.value.length - 1 // 循环到最后一个
          message.info('已回到末尾继续查找')
        }
        
        currentMatchIndex.value = prevIndex
        hasSelection.value = true
        selectAndScrollToMatch(prevIndex)
      }
      
      // 替换当前选中
      const replaceCurrent = () => {
        if (!searchText.value || !replaceText.value || currentMatchIndex.value === -1) return
        
        const model = editorModel.value
        const editor = editorInstance.value
        if (!model || !editor) return
        const range = matchRanges.value[currentMatchIndex.value]
        if (!range) return

        editor.executeEdits('replace-current', [{ range, text: replaceText.value }])
        nextTick(() => {
          updateMatchCount()
          if (matchRanges.value.length > 0) {
            const newIndex = Math.min(currentMatchIndex.value, matchRanges.value.length - 1)
            selectAndScrollToMatch(newIndex)
          }
          message.success('替换成功')
        })
      }
      
      // 全部替换
      const replaceAll = () => {
        if (!searchText.value || !replaceText.value) return
        
        const editor = editorInstance.value
        const model = editorModel.value
        if (!editor || !model) return

        const matches = model.findMatches(
          escapeRegExp(searchText.value),
          false,
          true,
          false,
          null,
          false,
          10000
        )

        if (matches && matches.length > 0) {
          const edits = matches.map(m => ({ range: m.range, text: replaceText.value }))
          // 使用单次 edit 操作合并，提升性能
          editor.pushUndoStop()
          editor.executeEdits('replace-all', edits)
          editor.pushUndoStop()
          clearHighlights()
          updateMatchCount()
          message.success(`已替换 ${matches.length} 处内容`)
        } else {
          message.warning('未找到需要替换的内容')
        }
      }
      
      // 使用 Ace 的标记系统为匹配结果着色
      
      // 分析长句（超过35字的行）
      const analyzeLongLines = (text) => {
        if (!text) {
          longLines.value = []
          longLinesCount.value = 0
          return
        }
        
        const lines = text.split('\n')
        const longLinesData = []
        
        lines.forEach((line, index) => {
          const length = line.length
          if (length > 35) {
            const preview = line.substring(0, 5) + (line.length > 5 ? '...' : '')
            longLinesData.push({
              lineNumber: index,
              length: length,
              preview: preview,
              fullText: line
            })
          }
        })
        
        longLines.value = longLinesData
        longLinesCount.value = longLinesData.length
      }
      
      // 分析标题编号
      const analyzeTitleNumbers = (text) => {
        console.log('analyzeTitleNumbers called with text:', text.substring(0, 100) + '...')
        if (!text) {
          titleNumbers.value = []
          titleNumbersCount.value = 0
          return
        }
        
        const lines = text.split('\n')
        const titleNumbersData = []
        
        lines.forEach((line, index) => {
          const trimmedLine = line.trim()
          if (!trimmedLine) return
          
          // 检测各种标题编号格式
          const patterns = [
            // 第X章/节/部/卷/篇/回
            { regex: /^第([一二三四五六七八九十百千万\d]+)[章节部卷篇回]$/, type: '章节' },
            // 数字编号：1. 2. 3. 等
            { regex: /^(\d+)[\.、]?$/, type: '数字' },
            // 中文数字编号：一、二、三、等
            { regex: /^([一二三四五六七八九十百千万]+)、$/, type: '中文' },
            // 字母编号：A. B. C. 等
            { regex: /^([A-Z])$/, type: '字母' },
            // 罗马数字：I. II. III. 等
            { regex: /^([IVX]+)$/, type: '罗马' },
            // 括号编号：(1) (2) (3) 等
            { regex: /^\((\d+)\)$/, type: '括号' },
            // 方括号编号：[1] [2] [3] 等
            { regex: /^\[(\d+)\]$/, type: '方括号' }
          ]
          
          for (const pattern of patterns) {
            const match = trimmedLine.match(pattern.regex)
            if (match) {
              console.log('Found title number match:', { line: trimmedLine, type: pattern.type, number: match[1] })
              titleNumbersData.push({
                lineNumber: index,
                number: match[1],
                text: match[2] ? (match[2].substring(0, 20) + (match[2].length > 20 ? '...' : '')) : '',
                type: pattern.type,
                fullText: trimmedLine
              })
              break
            }
          }
        })
        
        titleNumbers.value = titleNumbersData
        titleNumbersCount.value = titleNumbersData.length
      }
      
      // 切换面板
      const switchPanel = ({ key }) => {
        currentPanel.value = key
      }
      
      // 滚动到指定行
      const scrollToLine = (lineNumber) => {
        if (!editorInstance.value) return
        
        try {
          // 滚动到指定行，居中显示
          editorInstance.value.scrollToLine(lineNumber, true, true, () => {})
          // 将光标移动到该行
          editorInstance.value.gotoLine(lineNumber + 1, 0, true)
          // 高亮该行（临时）
          const session = editorInstance.value.getSession()
          const Range = ace.require('ace/range').Range
          const marker = session.addMarker(
            new Range(lineNumber, 0, lineNumber, 1),
            'ace-highlight-line',
            'fullLine',
            false
          )
          
          // 2秒后移除高亮
          setTimeout(() => {
            session.removeMarker(marker)
          }, 2000)
          
          message.info(`已跳转到第 ${lineNumber + 1} 行`)
        } catch (error) {
          console.error('滚动到指定行失败:', error)
          message.error('跳转失败')
        }
      }
      
      // 聚焦到搜索框
      const focusSearch = () => {
        const searchInput = document.querySelector('input[placeholder*="查找内容"]')
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
      }
      
      // 全局键盘事件处理
      const handleGlobalKeydown = (event) => {
        if (event.ctrlKey && event.key === 'f') {
          event.preventDefault()
          focusSearch()
        }
      }
      
      // 组件挂载时添加全局事件监听并初始化 Ace
      onMounted(() => {
        document.addEventListener('keydown', handleGlobalKeydown)
        if (editorContainerRef.value) {
          editorInstance.value = ace.edit(editorContainerRef.value)
          editorInstance.value.setTheme('ace/theme/textmate')
          editorInstance.value.session.setMode('ace/mode/text')
          editorInstance.value.setOptions({
            readOnly: false,
            wrap: true,
            fontFamily: 'Courier New, monospace',
            fontSize: 14,
            useWorker: false,
            scrollPastEnd: 0
          })
          editorInstance.value.session.setValue(textContent.value || '')
          window.addEventListener('resize', () => editorInstance.value?.resize())
          scheduleUpdateStats()

          editorInstance.value.session.on('change', () => {
            if (isSettingModelValue.value) return
            textContent.value = editorInstance.value.getValue()
            if (searchText.value) updateMatchCount()
            if (historySaveTimer) clearTimeout(historySaveTimer)
            historySaveTimer = setTimeout(() => {
              saveToHistory(textContent.value)
            }, 600)
            scheduleUpdateStats()
          })
        }
      })
      
      // 组件卸载时移除全局事件监听
      onUnmounted(() => {
        document.removeEventListener('keydown', handleGlobalKeydown)
        if (editorInstance.value) {
          editorInstance.value.destroy()
        }
      })
      
      // 处理文件上传
      const handleFileUpload = (file) => {
        console.log('文件上传触发:', file)
        
        const realFile = file && file.originFileObj instanceof Blob ? file.originFileObj : file

        // 验证文件类型
        if (!realFile.name.toLowerCase().endsWith('.txt')) {
          message.error('请选择TXT文件')
          return false
        }
        
        // 验证文件大小（限制为10MB）
        if (realFile.size > 10 * 1024 * 1024) {
          message.error('文件大小不能超过10MB')
          return false
        }
        
        const reader = new FileReader()
        
        reader.onload = (e) => {
          try {
            const content = e.target.result
            if (editorInstance.value) {
              isSettingModelValue.value = true
              editorInstance.value.session.setValue(content)
              isSettingModelValue.value = false
            }
            textContent.value = content
            originalContent.value = content
            scheduleUpdateStats()
            fileName.value = realFile.name
            
            // 保存到历史记录
            saveToHistory(content)
            
            if (searchText.value) updateMatchCount()
            message.success(`成功加载文件: ${realFile.name} (${content.length} 字符)`)
            console.log('文件加载成功:', realFile.name, content.length)
          } catch (error) {
            console.error('文件处理错误:', error)
            message.error('文件处理失败')
          }
        }
        
        reader.onerror = (error) => {
          console.error('文件读取错误:', error)
          message.error('文件读取失败')
        }
        
        reader.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100)
            console.log(`文件读取进度: ${progress}%`)
          }
        }
        
        // 开始读取文件
        reader.readAsText(realFile, 'UTF-8')
        return false // 阻止自动上传
      }
      

      
      // 下载文件
      const downloadFile = () => {
        if (!textContent.value) {
          message.warning('没有内容可下载')
          return
        }
        
        // 从 Ace 获取当前文本
        const text = editorInstance.value ? editorInstance.value.getValue() : textContent.value
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName.value || 'processed-text.txt'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        
        message.success('文件下载成功')
      }
      
      // 处理菜单点击（支持 OpenCC 多预设 + 动态识别标题）
      const handleProcessMenuClick = ({ key }) => {
        switch (key) {
          case 'call-api':
            callProcessAPI(true)
            break
          case 'call-api-no-ai':
            callProcessAPI(false)
            break
          case 's2t':
          case 's2tw':
          case 's2hk':
          case 's2twp':
          case 't2s':
            applyOpenCC(key)
            break
        }
      }
      

      
      // 保存到历史记录
      const saveToHistory = (text) => {
        // 移除当前位置之后的历史记录
        textHistory.value = textHistory.value.slice(0, currentHistoryIndex.value + 1)
        // 添加新的文本到历史记录
        textHistory.value.push(text)
        currentHistoryIndex.value = textHistory.value.length - 1
        
        // 限制历史记录数量（最多保存20个版本）
        if (textHistory.value.length > 20) {
          textHistory.value.shift()
          currentHistoryIndex.value--
        }
      }
      
      // 已移除撤销/重做 UI
      
      // 更新文本并显示结果
      const updateTextWithResult = (processedText, operationName) => {
        const originalLength = textContent.value.length
        const newLength = processedText.length
        
        // 保存到历史记录
        saveToHistory(processedText)
        
      // 同步到 Ace（避免触发多次变更事件）
      if (editorInstance.value) {
          isSettingModelValue.value = true
          editorInstance.value.session.setValue(processedText)
          isSettingModelValue.value = false
        } else {
          textContent.value = processedText
        }
        if (searchText.value) updateMatchCount()
        
        // 显示处理结果
        const removedChars = originalLength - newLength
        scheduleUpdateStats()
        if (removedChars > 0) {
          message.success(`${operationName}完成！删除了 ${removedChars} 个字符`)
        } else if (removedChars < 0) {
          message.success(`${operationName}完成！增加了 ${Math.abs(removedChars)} 个字符`)
        } else {
          message.info(`${operationName}完成！文本格式已优化`)
        }
      }
      
      // 转换（OpenCC）
      const applyOpenCC = async (preset) => {
        if (!textContent.value) {
          message.warning('没有内容可处理')
          return
        }
        try {
          const presetToLocale = (p) => {
            switch (p) {
              case 's2t':
                return { from: 'cn', to: 't' }
              case 's2tw':
                return { from: 'cn', to: 'tw' }
              case 's2hk':
                return { from: 'cn', to: 'hk' }
              case 's2twp':
                return { from: 'cn', to: 'twp' }
              case 't2s':
                return { from: 't', to: 'cn' }
              default:
                return null
            }
          }
          const cfg = presetToLocale(preset)
          if (!cfg) {
            message.error('不支持的转换预设')
            return
          }
          const converter = OpenCC.Converter(cfg)
          const processedText = converter(textContent.value)
          updateTextWithResult(processedText, `转换：${preset}`)
        } catch (e) {
          message.error('转换失败，请稍后重试')
          console.error(e)
        }
      }

      // 动态识别标题（简单启发式演示：识别形如 第x章/第x节/数字. 标题 的行，统一为行首添加 【标题】标签）
      const detectTitles = () => {
        if (!textContent.value) {
          message.warning('没有内容可处理')
          return
        }
        const lines = textContent.value.split('\n')
        const titleLike = /^(第[一二三四五六七八九十百千]+[章节部卷篇回]|\d+\.|\d+、|【?\s*标题\s*】?)/
        const processed = lines
          .map(line => {
            if (!line.trim()) return line
            if (titleLike.test(line.trim())) {
              return line.startsWith('【标题】') ? line : `【标题】${line}`
            }
            return line
          })
          .join('\n')
        updateTextWithResult(processed, '识别标题')
      }
      
      // 调用处理接口
      const callProcessAPI = async (use_ai_model = true) => {
        if (!textContent.value) {
          message.warning('没有内容可处理')
          return
        }
        
        try {
          const loadingText = use_ai_model ? '正在调用处理接口（含AI）...' : '正在调用处理接口（不含AI）...'
          message.loading(loadingText, 0)
          
          const response = await fetch('http://api_text_process.jmper.cn/process', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: textContent.value,
              use_ai_model: use_ai_model
            })
          })
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          
          const result = await response.json()
          console.log('result', result)
          if (result.result) {
            const operationName = use_ai_model ? '接口处理（含AI）' : '接口处理（不含AI）'
            updateTextWithResult(result.result, operationName)
            message.destroy()
            const successText = use_ai_model ? '接口处理完成（含AI）！' : '接口处理完成（不含AI）！'
            message.success(successText)
          } else {
            throw new Error(result.message || '处理失败')
          }
        } catch (error) {
          message.destroy()
          message.error(`接口调用失败: ${error.message}`)
          console.error('API call error:', error)
        }
      }
      
      // 重置内容：恢复为已缓存的原始文件内容（若无则清空）
      const clearText = () => {
        const contentToSet = originalContent.value || ''
        if (editorInstance.value) {
          isSettingModelValue.value = true
          editorInstance.value.session.setValue(contentToSet)
          isSettingModelValue.value = false
        }
        textContent.value = contentToSet
        // 不改变 fileName；仅恢复内容
        searchText.value = ''
        replaceText.value = ''
        saveToHistory(contentToSet)
        clearHighlights()
        updateMatchCount()
        scheduleUpdateStats()
        message.info(contentToSet ? '已恢复为原始内容' : '没有原始内容，已清空')
      }
      
      return {
        textContent,
        fileName,
        editorContainerRef,
        textHistory,
        currentHistoryIndex,
        searchText,
        replaceText,
        matchCount,
        hasSelection,
        matchRanges,
        currentMatchIndex,
        charCount,
        lineCount,
        wordCount,
        longLines,
        longLinesCount,
        titleNumbers,
        titleNumbersCount,
        currentPanel,
        handleFileUpload,
        downloadFile,
        clearText,
        callProcessAPI,
        handleProcessMenuClick,
        updateMatchCount,
        findNext,
        findPrev,
        replaceCurrent,
        replaceAll,
        scrollToLine,
        switchPanel,
        focusSearch,
        h
      }
    }
  }
  </script>
  
  <style scoped>
  .text-processor {
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .find-replace-toolbar {
    background-color: #f5f5f5;
    padding: 12px;
    border-radius: 6px;
  }
  
  .editor-wrapper {
    display: flex;
    gap: 16px;
    height: 520px;
  }
  
  .editor-container {
    position: relative;
    flex: 1;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
    overflow: hidden;
  }
  
  .stats-panel {
    width: 280px;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
    background: #fafafa;
    display: flex;
    flex-direction: column;
  }
  
  .stats-panel-header {
    padding: 0;
    border-bottom: 1px solid #f0f0f0;
    background: #fff;
    border-radius: 6px 6px 0 0;
  }
  
  .panel-menu {
    border: none;
    background: transparent;
  }
  
  .panel-menu .ant-menu-item {
    margin: 0;
    padding: 12px 16px;
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .panel-menu .ant-menu-item-selected {
    background-color: #e6f7ff;
    border-bottom: 2px solid #1890ff;
  }
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
  }
  
  .long-lines-list {
    padding: 8px 0;
  }
  
  .long-line-item {
    padding: 8px 16px;
    cursor: pointer;
    border-bottom: 1px solid #f5f5f5;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background-color 0.2s;
  }
  
  .long-line-item:hover {
    background-color: #e6f7ff;
  }
  
  .long-line-item:last-child {
    border-bottom: none;
  }
  
  .line-number {
    background: #1890ff;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 600;
    min-width: 24px;
    text-align: center;
  }
  
  .line-preview {
    flex: 1;
    font-size: 13px;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .line-length {
    font-size: 12px;
    color: #999;
    font-weight: 500;
  }
  
  .no-data {
    padding: 20px 16px;
    text-align: center;
    color: #999;
    font-size: 13px;
  }
  
  .title-numbers-list {
    padding: 8px 0;
  }
  
  .title-item {
    padding: 8px 16px;
    cursor: pointer;
    border-bottom: 1px solid #f5f5f5;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background-color 0.2s;
  }
  
  .title-item:hover {
    background-color: #e6f7ff;
  }
  
  .title-item:last-child {
    border-bottom: none;
  }
  
  .title-number {
    background: #52c41a;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 600;
    min-width: 24px;
    text-align: center;
  }
  
  .title-text {
    flex: 1;
    font-size: 13px;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .title-type {
    font-size: 11px;
    color: #999;
    background: #f5f5f5;
    padding: 1px 4px;
    border-radius: 2px;
  }
  
  :deep(.ace-find-match) {
    position: absolute;
    background-color: rgba(255, 255, 0, 0.35);
    outline: 1px solid rgba(255, 200, 0, 0.6);
  }
  
  :deep(.ace-current-match) {
    position: absolute;
    background-color: rgba(255, 100, 100, 0.45) !important;
    outline: 1px solid rgba(255, 50, 50, 0.9) !important;
    box-shadow: 0 0 6px rgba(255, 50, 50, 0.4);
  }
  
  :deep(.ace-highlight-line) {
    background-color: rgba(255, 193, 7, 0.3) !important;
    border-left: 3px solid #ffc107;
  }
  
  @keyframes pulse {
    0% {
      box-shadow: 0 0 4px rgba(255, 50, 50, 0.3);
    }
    50% {
      box-shadow: 0 0 8px rgba(255, 50, 50, 0.6);
    }
    100% {
      box-shadow: 0 0 4px rgba(255, 50, 50, 0.3);
    }
  }
  
  .stats {
    display: flex;
    justify-content: flex-end;
  }
  </style>