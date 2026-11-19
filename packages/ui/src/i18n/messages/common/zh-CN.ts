/**
 * 通用文案 —— 简体中文（L1）。
 *
 * key 规范：<domain>.<section>.<element>[.<state>]
 * 规范来源：packages/conventions/i18n/key-patterns.json
 */

export const zhCN = {
  'common.action.confirm': '确定',
  'common.action.cancel': '取消',
  'common.action.save': '保存',
  'common.action.delete': '删除',
  'common.action.edit': '编辑',
  'common.action.create': '创建',
  'common.action.close': '关闭',
  'common.action.back': '返回',
  'common.action.retry': '重试',
  'common.action.search': '搜索',
  'common.action.reset': '重置',
  'common.action.copy': '复制',
  'common.action.download': '下载',
  'common.action.upload': '上传',
  'common.action.export': '导出',
  'common.action.import': '导入',
  'common.action.refresh': '刷新',
  'common.action.more': '更多',

  'common.state.loading': '加载中…',
  'common.state.empty': '暂无数据',
  'common.state.success': '操作成功',
  'common.state.error': '操作失败',

  'common.error.network': '网络异常，请检查连接后重试',
  'common.error.server': '服务暂时不可用，请稍后重试',
  'common.error.unauthorized': '登录已失效，请重新登录',
  'common.error.forbidden': '没有访问权限',
  'common.error.notFound': '请求的资源不存在',
  'common.error.conflict': '操作与当前状态冲突，请刷新后重试',
  'common.error.rateLimited': '操作过于频繁，请稍后重试',
  'common.error.unknown': '发生未知错误',

  'common.empty.title': '暂无内容',
  'common.empty.hint': '当前没有可显示的数据',
  'common.empty.action': '开始创建',

  'common.label.all': '全部',
  'common.label.more': '查看更多',
  'common.label.total': '共 {count} 条',
  'common.label.required': '必填',
  'common.label.optional': '可选',

  'theme.preset.scholar.label': '学术紫',
  'theme.preset.scholar.description': '稳重内敛，延续现有品牌色',
  'theme.preset.academic.label': '学术蓝',
  'theme.preset.academic.description': '正式通用，国际期刊常见',
  'theme.preset.emerald.label': '墨绿',
  'theme.preset.emerald.description': '护眼，Nature 期刊风格',
  'theme.preset.graphite.label': '石墨',
  'theme.preset.graphite.description': '极简中性，打印友好',
  'theme.preset.lab.label': '实验室橙',
  'theme.preset.lab.description': '活力醒目，适合演示场景',

  'theme.label.mode': '主题模式',
  'theme.label.density': '界面密度',
  'theme.label.primary': '品牌主色',
  'theme.label.radius': '圆角',
  'theme.label.brand': '品牌',

  'theme.mode.light': '亮色',
  'theme.mode.dark': '暗色',
  'theme.mode.auto': '跟随系统',

  'theme.density.default': '标准',
  'theme.density.compact': '紧凑',

  'i18n.label.language': '语言',
} as const;
