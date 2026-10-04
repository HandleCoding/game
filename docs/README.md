# 开发文档入口

云端文档主目录：`/opt/pair-play-dev/docs`。Agent 第一入口：`/opt/pair-play-dev/AGENTS.md`。

| 文件 | 内容 |
| --- | --- |
| [handover.md](handover.md) | 当前真实状态、源码地图、限制、下一步 |
| [development-guide.md](development-guide.md) | 如何在京东云开发、运行和协作 |
| [testing-guide.md](testing-guide.md) | 自动测试、手机 / 电脑验收、测试报告 |
| [deployment-runbook.md](deployment-runbook.md) | 发布、备份、故障定位、回滚 |
| [technology-decisions.md](technology-decisions.md) | 目标技术栈、数据库迁移、环境隔离 |
| [multi-game-architecture.md](multi-game-architecture.md) | 对局型游戏、注册表、人数与可见性 |
| [persistent-game-architecture.md](persistent-game-architecture.md) | 农场 / 牧场、离线成长、事务和任务 |
| [test-reports/](test-reports/) | 每次云端测试的日志与验收记录 |

这些文件包含实际状态和目标方案；以 handover 标注的完成状态为准。代码变化后同步维护文档，不让未来 Agent 依据过时说明操作。
