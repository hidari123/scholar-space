/**
 * AntD 组件再导出 —— 业务代码的**唯一**组件入口。
 *
 * ⚠️ 为什么需要这一层（ADR-0002 的落地缺口）：
 *
 *   铁律说「业务代码只能 import from '@scholarspace/ui'」，
 *   但如果 `@scholarspace/ui` 不再导出组件，业务代码就**别无选择**
 *   只能 `import { Button } from 'antd'` —— 铁律形同虚设。
 *
 *   这一层把 AntD 的常用组件集中再导出，业务代码改成：
 *     import { Button, Form, Input } from '@scholarspace/ui';
 *
 *   好处：
 *     · 换组件库时只改这一层
 *     · 业务包不直接依赖 antd → 版本不冲突
 *     · G7 护栏（禁止直接 import antd）真正可执行
 *
 * ⚠️ **只再导出需要的** —— 全量再导出会让 tree-shaking 失效，
 *    并让 `@scholarspace/ui` 的体积检查（G21）失去意义。
 */

export type {
  ButtonProps,
  FormInstance,
  FormItemProps,
  FormProps,
  InputProps,
  MenuProps,
  ModalProps,
  SelectProps,
  TableProps,
  TabsProps,
  TagProps,
} from 'antd';
export {
  Alert,
  App,
  AutoComplete,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  ConfigProvider,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Menu,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Result,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Spin,
  Statistic,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
  Upload,
} from 'antd';
