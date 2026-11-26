# 谈吐素养 · 经典训练系统

以历史、人文、古诗词、典故与全球经典为素材，系统提升谈吐素养与口才的在线训练工具。

**完整内容：274 条经典素材 + 31 道练习题**

---

## 仓库必须包含的文件（缺一不可）

```
你的仓库根目录/
├── index.html                      ← 主页面
├── README.md
├── .gitignore
└── data/
    ├── phase1_materials.json       ← 完整素材库（274条）
    ├── exercises_batch1.json       ← 完整练习题（31道）
    └── scoring_config.json         ← 评分配置
```

> **重要**：`data` 文件夹必须和 `index.html` 在同一级目录下。  
> 页面通过 `./data/phase1_materials.json` 加载数据，路径不对会显示「数据加载失败」。

---

## 部署到 GitHub Pages

1. 新建 Public 仓库
2. 把上述全部文件上传到仓库根目录（保持 `data/` 文件夹结构）
3. 打开 **Settings → Pages**
4. Source 选择 **Deploy from a branch**
5. Branch 选 `main`，文件夹选 `/ (root)`
6. Save 后等待 1～2 分钟
7. 访问：`https://你的用户名.github.io/仓库名/`

### 用 Git 命令上传示例

```bash
git init
git add .
git commit -m "谈吐素养经典训练系统 - 完整版"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

---

## 功能说明

| 模块 | 说明 |
|------|------|
| 经典素材库 | 274 条，支持类别/场景/难度筛选与搜索，分页浏览 |
| 场景化练习 | 金句嵌入、即兴发言、辩论反驳、角色扮演等 31 题 |
| 即时反馈 | 自动检测素材使用与结构，给出得分与建议 |
| 练习记录 | 浏览器本地保存历史成绩 |

---

## 本地预览

直接用浏览器打开 `index.html` 即可（需通过本地服务器访问，否则 fetch 可能被限制）：

```bash
# 推荐用任意静态服务器
npx serve .
# 或
python3 -m http.server 8000
```

然后访问 http://localhost:8000

---

## 许可

素材基于中国古典文献与公开经典语录整理，仅供学习交流。代码可自由使用与修改。
