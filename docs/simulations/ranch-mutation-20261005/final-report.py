"""Current report: progressive fusion; earlier alternatives retained in raw data."""
import argparse, hashlib, json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

def main(root):
    a=json.loads((root/'analysis-results.json').read_text())
    t=json.loads((root/'trajectory-results.json').read_text())
    f=json.loads((root/'progressive-results.json').read_text())
    assert len(t['runs'])==76 and t['baseline_match'] and len(t['validation_species'])==36
    font=FontProperties(fname='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
    plt.rcParams.update({'font.family':font.get_name(),'axes.unicode_minus':False,
        'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
    fig,axs=plt.subplots(1,2,figsize=(10,4.6),layout='constrained')
    for ax,key,title in [(axs[0],'ordinary_required','全普通路线所需动物'),(axs[1],'tokens','指定继承路线所需晶露')]:
        vals=[r[key] for r in f['rules']]
        ax.bar(['每阶2只','高阶3只'],vals,color=['#b7c4a6','#679380'])
        ax.set(title=title,ylabel='只' if key=='ordinary_required' else '枚',ylim=(0,max(vals)*1.18))
        for i,v in enumerate(vals):ax.text(i,v+max(vals)*.03,str(v),ha='center')
    fig.suptitle('合成方案对照：优秀、史诗2只；传奇、无双3只',fontsize=13)
    fig.savefig(root/'progressive-comparison.png',dpi=160);fig.savefig(root/'progressive-comparison.svg');plt.close(fig)
    # Refresh the prior plot so its title cannot imply the superseded epic cap is current.
    fig,axs=plt.subplots(1,2,figsize=(11,4.8),layout='constrained')
    rates=[.1,.2,.3]
    axs[0].plot([p*100 for p in rates],[(1-(1-p)**2)*100 for p in rates],label='至少一次变异',color='#679380',marker='o')
    axs[0].plot([p*100 for p in rates],[p*p*100 for p in rates],label='双属性',color='#aa81bf',marker='o')
    axs[0].set(title='两次独立机会的整只概率',xlabel='单次概率（%）',ylabel='整只概率（%）');axs[0].legend()
    rows=[x for x in a['rounding'] if x['id']=='chicken' and x['population']=='lifecycle-short-0.30']
    axs[1].bar(['向下取整','四舍五入','向上取整','小数累计'],[x['net_increase_pct'] for x in rows],color=['#bbb','#b7c4a6','#d79481','#679380'])
    axs[1].set(title='小鸡净利润：不同价格结算方式',ylabel='比无变异基线增加（%）')
    for i,x in enumerate(rows):axs[1].text(i,x['net_increase_pct']+4,f"{x['net_increase_pct']:.1f}%",ha='center')
    fig.savefig(root/'balance-comparison.png',dpi=160);fig.savefig(root/'balance-comparison.svg');plt.close(fig)
    lines=['# 一起牧场：变异与递增合成数值方案',
      '', '日期：2026-10-05（Asia/Shanghai）。状态：云端离线数值模拟与设计候选，未实现或发布游戏功能。',
      '', '## 本轮结论', '',
      '推荐采用最新讨论的递增配方：同物种、同品质，普通×2→优秀，优秀×2→史诗，史诗×3→传奇，传奇×3→无双，合成必成。替代此前讨论的“传奇、无双不可合成”候选，原始对照结果仍留档。此报告新提出的精确品质权重、金币费用、材料来源是推荐值，不应误写成用户已经批准上线。',
      '', '全普通一路合成无双需要36只，31次操作（优秀18次、史诗9次、传奇3次、无双1次），原来每阶两只需要16只、15次。按候选晶露成本0/3/12/48，需要111枚，而旧路线84枚；每天最多3枚时名义材料积累期37天、旧路线28天。已有天然高品质可跳过步骤，因此37天不是硬等待时间或保证日期；成熟、完成、同物种积累、资金、真实产出日会改变结果。',
      '', '允许刷小鸡，确定路线提供长期目标；不同物种分别收集，名宠堂合成不恢复生产、不返经验、不回改库存售价。高阶合成需要界面明确展示所消耗个体，锁定/收藏的个体不可自动选为材料。',
      '', '## 冻结规则与实验假设', '',
      '- 购买与成年各一次变异机会；每次基础10%，图鉴提高后最高30%，不是两次合计。',
      '- 属性雷、火、水、黄金、梦幻；成年第二次成功排除已有属性，最多双属性；品质取两次抽取中较高者，不因失败降级。',
      '- 普通/优秀/史诗/传奇/无双对应白/绿/紫/金/红。普通也可携带属性，品质与属性分开记录。',
      '- 图鉴按真正发现的物种+无序属性组合去重，品质只记录最高，合成可发现新组合；雷火与火雷同一种。',
      '- 属性指定：继承选中的现有组合；随机：从全属性池重新抽，不是在父母中随机选择；双属性保留一个、重抽另一个。',
      '- 三只材料不会自动变三属性。双属性结果必须有双属性来源；三只单属性不能靠合成自动拼成双属性。没有属性的材料选择随机可获得单属性。',
      '- 成长/生产周期、轮次、数量、经验、饲料不因变异增加。旧成年/退休个体不补购买判定，未成年保留一次成年判定。',
      '', '## 两次机会的概率', '',
      '|每次概率|无变异|单属性|双属性|至少一次成功|','|---:|---:|---:|---:|---:|']
    for p in [.1,.2,.3]:lines.append(f'|{p:.0%}|{(1-p)**2:.0%}|{2*p*(1-p):.0%}|{p*p:.0%}|{1-(1-p)**2:.0%}|')
    lines += ['', '若两个事件使用不同概率p1、p2，至少一次成功=1−(1−p1)(1−p2)，双属性=p1×p2。后台必须一次性存储结果，重试、重新登录或重复结算不能重新抽取。',
      '', '## 合成成本建议', '',
      '|目标品质|材料品质与只数|晶露|金币|随机额外晶露|', '|---|---|---:|---|---:|',
      '|优秀|普通×2|0|ceil(物种认养价×10%)|1|',
      '|史诗|优秀×2|3|ceil(物种认养价×25%)|2|',
      '|传奇|史诗×3|12|ceil(物种认养价×50%)|4|',
      '|无双|传奇×3|48|ceil(物种认养价×100%)|8|',
      '', '无双封顶，不提供无损反复洗属性配方。合成选择主个体保留身份与历史，其余个体标记已融合，图鉴发现不回退。普通小鸡当前认养价13，完整普通→无双指定路线106金币；只在最后一步随机为119晶露，每步都随机为167晶露。后者名义材料期55.7天，不能当作玩家实际耗时。',
      '', '晶露候选来源：真实生产批次，每个个体每个产出日最多1枚、整个账号每个产出日最多3枚；同物种可以，离线按真实产出日期结算。购买、合成、赠送的初始round0批次不发；通过实际收获事务发放，批次幂等，不能靠刷新重复领。',
      '', '## 实际合成闭环发现', '',
      '模拟真正扣金币/晶露、消耗材料动物、保留来源属性并记录合成图鉴。18条递增配方“从低到高随手合成/重抽”轨迹90天没有合成无双：低阶持续用掉晶露，不能把纯材料树的37天误当自动达成。18条预留高阶成本的轨迹中，17条90天内实际合成无双；这些是指定策略与少量种子的结果，不是玩家成功率。',
      '', '预留策略：指定继承先为三次传奇与一次无双留84枚，高阶材料够时优先合高阶；随机路线留104枚。它只是模拟玩家存材料的行为，不是必须每天上限之外锁住材料，也不要求游戏自动扣除或强制储蓄。产品建议给出“目标配方/当前材料/还缺多少”和低阶花费预览，让用户自主决定。',
      '', '|品质权重候选|策略|每4小时回访|每8小时回访|每12小时回访|', '|---|---|---:|---:|---:|']
    for policy in ['lifecycle','conservative']:
      for mode in ['inherit','random']:
        rows=[next(r for r in t['runs'][58:] if r['policy']==policy and r['strategy']=='income' and r['fusionMode']==mode and r['gap']==g) for g in [4,8,12]]
        days=[f"{r['firstCraft']['4']:.1f}天" if '4' in r['firstCraft'] else '>90天' for r in rows]
        lines.append('|'+('周期分档' if policy=='lifecycle' else '统一保守')+'|'+('指定继承' if mode=='inherit' else '每步随机')+'|'+'|'.join(days)+'|')
    lines += ['', '上表为净收益/小时选种、资金/饲料/扩建受限、10%起步图鉴动态增长、90天样本中第一次实际合成无双。每格仅1个固定种子，不能称作中位数、P90或最佳策略。天然传奇会让首个无双在首个合成传奇之前出现。',
      '', '只养小鸡、周期分档、预留材料的三种回访频率：首次指定合成无双约15.2/19.7/20.0天，随机约18.2/23.7/24.0天。天然高品质缩短材料树，允许这种收藏路线；90天图鉴单次概率仍约12%，并未刷满30%。最稀有指定双属性无双所需时间没有在本轮做分布估计。',
      '', '## 品质与属性概率候选', '',
      '成功变异后再抽品质。统一保守对照权重为普通45%、优秀40%、史诗12%、传奇2.8%、无双0.2%。周期分档让等待较长的物种有更高天然惊喜，作为推荐候选保留；合成又提供确定路线，不必为了保护无双而禁止低级物种获得它。',
      '', '|完整生涯T|普通|优秀|史诗|传奇|无双|', '|---|---:|---:|---:|---:|---:|',
      '|≤2小时|40%|42%|15%|2.9%|0.1%|',
      '|>2至24小时|36%|42%|17%|4.5%|0.5%|',
      '|>24至72小时|32%|42%|18%|7%|1%|',
      '|>72小时|28%|40%|20%|8%|4%|',
      '', 'T=成长时间+有限轮次×生产周期，按物种配置快照固定，不因饥饿或离线拖延提高档位。4%指一次成功后的条件权重；单次30%时长周期动物整只无双概率2.3856%，不是每个动物4%。不把这组权重当已经获批的运营参数；36物种、未来新增物种都要复核档位。',
      '', '属性候选权重：雷25%、火25%、水25%、黄金15%、梦幻10%。第二属性排除已有属性再归一。随机可抽回被替换的属性，不承诺每次发现新组合。属性加价不同，指定继承保留来源组合，随机付费换一次全池机会。',
      '', '## 产物价格：避免整数结算放大', '',
      '建议品质加价0/10/25/50/100%，雷火水各5%、黄金10%、梦幻15%；双属性加价相加但封顶20%。价格=基价×(1+品质加价+属性加价)，最大2.2倍，经验/产量/周期保持基线。产物批次快照品质、属性、报价；日后合成或退休不追溯修改库存。',
      '', '在30%单次变异、周期分档短周期下，平均销售收入增加9.39%；小鸡完整生涯基线18收入−13购买−1.1667饲料=3.8333净利润，加价后净利润约5.5232、增加44.08%。收入加成与净利润增幅必须区分。',
      '', '逐个向上取整会把小鸡净利润增幅放大到239.76%，逐个向下取整则几乎抹掉变异价值。建议千分金币整型报价、钱包持久化0至999余数，成交整金币入账、余数累计；拆单不改变总收入。模拟已核对100份一次卖/逐份卖/任意拆单相同。',
      '', '![概率与结算](simulations/ranch-mutation-20261005/balance-comparison.png)',
      '', '![合成配方对照](simulations/ranch-mutation-20261005/progressive-comparison.png)',
      '', '## 图鉴提高变异率', '',
      '完成养殖的不同物种到6/12/18/24/30种，额外+2/+4/+6/+8/+10个百分点；发现的不同物种+属性组合到10/30/60/100/150个，同样额外+2/+4/+6/+8/+10个百分点。基础10%加两条成长线，单次最高30%。固定门槛，扩充图鉴不导致已解锁加成下降。',
      '', '一物种只有5个单属性+10个双属性组合，共15种；重复只记一次，品质不另外重复发概率奖励，动物与产物图鉴不重复发。无限养小鸡不能独立刷满全局概率。合成发现已纳入实际轨迹，不再仅以自然发现代表反馈环。递增实际合成的30天样本单次概率约14%至22%，没有自动达到30%。',
      '', '## 模拟输入、验证与复现', '',
      f"输入冻结36种开发规则版本3，原Git HEAD `{a['source']['git_head']}`。实际含其他Agent未提交代码，所以复制8个依赖文件与SHA-256，不能仅以HEAD复现。初始800金币、240份饲料、4位置；每只有效生长/生产每小时2份饲料，完成/满存停粮。", '',
      '完成21组各100万次概率样本（共2100万），旧首批材料4万样本、配方对比20万首批材料样本，76条90天轨迹。36物种的有限经验、金币、饲料、完成后10天停粮逐项验证；零变异4小时对照1/7/30/90天与冻结原模拟完全一致。抽样均价与精确枚举在6个标准误以内。',
      '', '真实合成样本共45条：9条史诗封顶、18条递增随手合成、18条递增预留高阶。检查金币非负安全整数、余数0至999、实际资源扣除与费用相同、双属性有来源且最多2种。未运行任何数据库读写、真实账号操作、游戏接口或部署。',
      '', '局限：轨迹种子少且策略固定，不能预测真人行为或作为总体到达时间分布；没有跨账号交易、UI、完整最优属性选择、迁移、并发或生产上线验收。首批材料抽样只是给定库存首次够配方的分布，不能代替真实时间；收益模型不改变冻结引擎源码，叠加费用/变异仅由实验包装层完成。',
      '', '复现（云端运行，numpy；绘图使用独立venv的matplotlib与Noto CJK字体）：', '', '```sh',
      'ROOT=/opt/pair-play-dev/artifacts/mutation-balance-20261005',
      'python3 "$ROOT/analyze.py" --root "$ROOT"',
      'python3 "$ROOT/progressive.py" --root "$ROOT"',
      '/opt/pair-play-dev/node_modules/.bin/tsx "$ROOT/source/scripts/mutation-trajectory.ts" "$ROOT"',
      'SIM_APPEND_FUSION=1 /opt/pair-play-dev/node_modules/.bin/tsx "$ROOT/source/scripts/mutation-trajectory.ts" "$ROOT"',
      'SIM_APPEND_PROGRESSIVE=1 /opt/pair-play-dev/node_modules/.bin/tsx "$ROOT/source/scripts/mutation-trajectory.ts" "$ROOT"',
      'SIM_APPEND_SAVING=1 /opt/pair-play-dev/node_modules/.bin/tsx "$ROOT/source/scripts/mutation-trajectory.ts" "$ROOT"',
      '"$ROOT/venv/bin/python" "$ROOT/final-report.py" --root "$ROOT"',
      '```', '', '永久资料目录：`/opt/pair-play-dev/docs/simulations/ranch-mutation-20261005`，可将ROOT改到此目录。绘图解释器仍使用上述隔离venv。原report.py保留史诗封顶旧候选脚本；当前结果76条，应使用final-report.py生成本报告。manifest.json记录资料文件哈希。',
      '', '## 实施接口与持久化边界', '',
      '此阶段只有设计与模拟，后续实施保持平台账号、牧场资产、名宠堂与图鉴职责分开。新增mutation_rules_version、purchase_roll、adult_roll、grade、attributes及报价快照；event_id唯一，成年判定与状态转移在同一事务中。名宠堂资产增加锁定与fusion_consumed状态、来源谱系。',
      '', '合成请求包括配方版本、2或3个材料ID、主个体ID、inherit/random、保留属性与幂等键。后台从数据库校验归属、同物种同品质、已入堂、未消费/锁定、不同材料ID与足额金币/晶露；锁定材料行，在同一事务中扣款、标记消费、创建或升级唯一结果、记录随机抽样与图鉴发现，提交后返回结果。随机种子/结果由后台决定，客户端不能重试择优。',
      '', '产物采用批次快照与整数定点报价；出售钱包余数和金币同事务。产出晶露有账号+日期上限与个体+日期唯一记录，离线补结算不重复计奖。图鉴唯一键species+sorted_attribute_ids，历史来源保留自然/合成与规则版本；最高品质单独更新。',
      '', '配置版本可回滚，老个体/旧产品按原快照，不为匹配模拟删除或重置正式存档。上线前另行核验数据库迁移、并发/重复提交/材料锁定/批量离线、手机与电脑界面；本次不操作其他Agent的生命周期实现、分支、暂存区或运行服务。',
      '', '## 输入依赖哈希', '', '|文件|SHA-256|','|---|---|']
    for path,digest in a['source']['source_sha256'].items():lines.append(f'|{path}|{digest}|')
    report='\n'.join(lines)+'\n';(root/'ranch-mutation-balance-simulation.md').write_text(report)
    print(json.dumps({'trajectories':len(t['runs']),'report_chars':len(report),'sha256':hashlib.sha256(report.encode()).hexdigest()}))

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True)
    main(ap.parse_args().root)
