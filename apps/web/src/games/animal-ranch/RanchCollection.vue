<script setup lang="ts">
import { computed, ref } from "vue";
import type { RanchView } from "../../../../../packages/contracts/src/ranch";
import AnimalPortrait from "./AnimalPortrait.vue";
import ProductIcon from "./ProductIcon.vue";
import RanchTraits from "./RanchTraits.vue";
const props = defineProps<{
  farm: RanchView;
  mode: "album" | "store" | "goals";
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<boolean>;
}>();
const filter = ref("all"),
  search = ref(""),
  grade = ref("all"),
  picked = ref(""),
  quantity = ref(1),
  confirm = ref(false);
const m = computed(() => props.farm.mutation!);
const variants = computed(() =>
  m.value.codex.filter((e) => e.attributes.length),
);
const seenSpecies = computed(
  () => new Set(m.value.codex.map((e) => e.species)),
);
const species = computed(() =>
  props.farm.species.filter(
    (k) =>
      (!search.value || k.name.includes(search.value)) &&
      (filter.value === "all" ||
        (filter.value === "discovered" && seenSpecies.value.has(k.id)) ||
        (filter.value === "variant" &&
          variants.value.some((e) => e.species === k.id))),
  ),
);
const groups = computed(() => {
  const rows = new Map<
    string,
    (typeof m.value.lots)[number] & { lotIds: string[] }
  >();
  for (const l of m.value.lots) {
    const base = JSON.stringify([
      l.product,
      l.grade,
      l.attributes,
      l.priceMilli,
      l.locked,
    ]);
    let part = 0,
      key = base + ":" + part;
    while (rows.has(key) && rows.get(key)!.lotIds.length >= 200)
      key = base + ":" + ++part;
    const old = rows.get(key);
    if (old) {
      old.quantity += l.quantity;
      old.lotIds.push(l.id);
      if (old.animalId !== l.animalId) old.animalId = null;
    } else rows.set(key, { ...l, id: key, lotIds: [l.id] });
  }
  return [...rows.values()];
});
const lots = computed(() =>
  groups.value.filter(
    (l) =>
      (grade.value === "all" || l.grade === Number(grade.value)) &&
      (filter.value === "all" ||
        (filter.value === "locked" && l.locked) ||
        (filter.value === "sale" && !l.locked)) &&
      (!search.value || productName(l.product).includes(search.value)),
  ),
);
const selected = computed(
  () => lots.value.find((l) => l.id === picked.value) || lots.value[0],
);
function productName(id: string) {
  return props.farm.species.find((k) => k.product === id)?.productName || id;
}
const sellable = computed(() => m.value.lots.filter((l) => !l.locked));
const value = computed(() =>
  sellable.value.reduce((n, l) => n + l.quantity * l.priceMilli, 0),
);
const fmt = (n: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 }).format(n / 1000);
const progress = (kind: string) =>
  kind === "variant"
    ? variants.value.length
    : kind === "dual"
      ? variants.value.filter((e) => e.attributes.length === 2).length
      : kind === "species"
        ? m.value.completedSpecies.length
        : kind === "grade"
          ? Math.max(0, ...m.value.codex.map((e) => e.grade))
          : m.value.goals.find((g) => g.id === "first-fusion")?.completedAt
            ? 1
            : 0;
async function sell() {
  if (!selected.value) return;
  const ok = await props.run("sellProducts", {
    lotIds: selected.value.lotIds,
    quantity: quantity.value,
  });
  if (ok) {
    confirm.value = false;
    quantity.value = 1;
  }
}
function choose(id: string) {
  picked.value = id;
  quantity.value = 1;
  confirm.value = false;
}
function speciesEntries(id: string) {
  return m.value.codex.filter((e) => e.species === id);
}
</script>
<template>
  <section class="ranch-modern collection-root">
    <template v-if="mode === 'album'">
      <div class="collection-summary">
        <div>
          <small>你的探索记录</small>
          <h3>已发现 {{ seenSpecies.size }} / {{ farm.species.length }} 种</h3>
          <p>
            变异组合 {{ variants.length }} · 已完成养殖
            {{ m.completedSpecies.length }} 种
          </p>
        </div>
        <div class="probability-stat">
          <strong>{{ m.probabilityBp / 100 }}%</strong><span>每次变异机会</span>
        </div>
      </div>
      <div class="modern-tabs">
        <button
          v-for="f in [
            ['all', '全部'],
            ['discovered', '已发现'],
            ['variant', '变异品种'],
          ]"
          :key="f[0]"
          :aria-pressed="filter === f[0]"
          @click="filter = f[0]!"
        >
          {{ f[1] }}
        </button>
      </div>
      <input
        v-model="search"
        type="search"
        aria-label="搜索已发现动物"
        placeholder="搜索动物"
        maxlength="40"
      />
      <div class="codex-grid">
        <article
          v-for="k in species"
          :key="k.id"
          class="codex-card"
          :class="{ undiscovered: !seenSpecies.has(k.id) }"
        >
          <div class="codex-portrait">
            <AnimalPortrait
              v-if="seenSpecies.has(k.id)"
              :species="k.id"
              :name="k.name"
              :baby="false"
            /><span v-else class="unknown-species">?</span>
          </div>
          <h4>{{ k.name }}</h4>
          <small v-if="!seenSpecies.has(k.id)"
            >尚未发现 · Lv. {{ k.unlockLevel }}</small
          >
          <template v-else
            ><small>{{
              m.completedSpecies.includes(k.id)
                ? "已完成养殖"
                : "已发现，待完成养殖"
            }}</small>
            <div
              v-for="e in speciesEntries(k.id)"
              :key="e.key"
              class="discovery-row"
            >
              <RanchTraits :grade="e.grade" :attributes="e.attributes" /><button
                v-if="!e.seen"
                class="new-discovery"
                :disabled="busy"
                @click="run('markCodexSeen', { entryKeys: [e.key] })"
              >
                新发现
              </button>
            </div></template
          >
        </article>
      </div>
      <details class="rules-note">
        <summary>变异概率如何提升？</summary>
        <p>
          购买和成年各一次独立判定。完成6/12/18/24/30种养殖，以及发现10/30/60/100/150种属性组合，每个里程碑各增加2个百分点，上限30%。预览、参观和重复发现不会增加进度。
        </p>
      </details>
    </template>
    <template v-else-if="mode === 'store'">
      <div class="collection-summary">
        <div>
          <small>每一批都有自己的价值</small>
          <h3>{{ m.lots.reduce((n, l) => n + l.quantity, 0) }} 份产物</h3>
          <p>
            可出售价值 {{ fmt(value) }} 金币 · 钱包余数 {{ fmt(m.remainder) }}
          </p>
        </div>
        <button
          class="modern-primary"
          :disabled="busy || !sellable.length"
          @click="
            confirm = true;
            picked = 'all';
          "
        >
          出售未锁定库存
        </button>
      </div>
      <div class="inventory-filters">
        <div class="modern-tabs">
          <button
            v-for="f in [
              ['all', '全部'],
              ['sale', '可出售'],
              ['locked', '已锁定'],
            ]"
            :key="f[0]"
            :aria-pressed="filter === f[0]"
            @click="filter = f[0]!"
          >
            {{ f[1] }}
          </button>
        </div>
        <select v-model="grade" aria-label="按产物品质筛选">
          <option value="all">全部品质</option>
          <option
            v-for="(name, i) in ['普通', '优秀', '史诗', '传奇', '无双']"
            :key="i"
            :value="i"
          >
            {{ name }}
          </option></select
        ><input
          v-model="search"
          type="search"
          aria-label="搜索产物"
          placeholder="搜索产物"
        />
      </div>
      <p v-if="!lots.length" class="modern-empty">
        这里还没有符合条件的产物，回牧场收获看看。
      </p>
      <div class="warehouse-layout">
        <div class="warehouse-grid">
          <button
            v-for="l in lots"
            :key="l.id"
            class="warehouse-card"
            :aria-pressed="selected?.id === l.id"
            @click="choose(l.id)"
          >
            <ProductIcon :product="l.product" /><strong>{{
              productName(l.product)
            }}</strong
            ><RanchTraits :grade="l.grade" :attributes="l.attributes" /><span
              >× {{ l.quantity }} · {{ fmt(l.priceMilli) }} / 份</span
            ><small v-if="l.locked">已锁定，不会被批量出售</small>
          </button>
        </div>
        <aside v-if="selected" class="modern-detail">
          <ProductIcon :product="selected.product" />
          <h3>{{ productName(selected.product) }}</h3>
          <RanchTraits
            :grade="selected.grade"
            :attributes="selected.attributes"
          />
          <p>
            单价 {{ fmt(selected.priceMilli) }} 金币，库存
            {{ selected.quantity }} 份 · {{ selected.lotIds.length }} 个产出批次
          </p>
          <p class="quiet">
            售价在产出时确定。伙伴后来变异或融合不会改变这批产物。
          </p>
          <label
            >出售数量
            <input
              v-model.number="quantity"
              type="number"
              min="1"
              :max="selected.quantity"
              aria-label="出售产物数量" /></label
          ><button
            class="modern-primary"
            :disabled="
              busy ||
              selected.locked ||
              !Number.isInteger(quantity) ||
              quantity < 1 ||
              quantity > selected.quantity
            "
            @click="confirm = true"
          >
            出售 {{ quantity }} 份 ·
            {{ fmt(quantity * selected.priceMilli) }} 金币</button
          ><button
            :disabled="busy"
            @click="
              run('setInventoryLock', {
                lotIds: selected.lotIds,
                locked: !selected.locked,
              })
            "
          >
            {{ selected.locked ? "解除锁定" : "锁定这批产物" }}
          </button>
        </aside>
      </div>
      <div
        v-if="confirm"
        class="modern-confirm"
        role="alertdialog"
        aria-label="确认出售产物"
      >
        <strong>{{
          picked === "all" ? "出售所有未锁定产物？" : "确认出售这批产物？"
        }}</strong>
        <p>
          {{
            picked === "all"
              ? "锁定的产物会保留。"
              : "品质、属性与单价以当前批次为准。"
          }}不足1金币的部分会累积到钱包余数。
        </p>
        <button
          class="modern-primary"
          :disabled="busy"
          @click="
            picked === 'all'
              ? run('sellProducts', {}).then((ok) => {
                  if (ok) confirm = false;
                })
              : sell()
          "
        >
          确认出售</button
        ><button :disabled="busy" @click="confirm = false">取消</button>
      </div>
    </template>
    <template v-else>
      <div class="collection-summary">
        <div>
          <small>慢慢探索，留下发现</small>
          <h3>收藏目标</h3>
          <p>最多追踪3项 · 目标本身不额外赠送资源</p>
        </div>
        <span>晶露 {{ m.dew }} · 今日产出日已领取 {{ m.dailyDew }} / 3</span>
      </div>
      <article v-for="g in m.goals" :key="g.id" class="goal-card">
        <div>
          <h4>{{ g.name }}</h4>
          <p>
            {{
              g.completedAt
                ? "已达成"
                : Math.min(progress(g.kind), g.target) + " / " + g.target
            }}
          </p>
          <progress
            :value="progress(g.kind)"
            :max="g.target"
            :aria-label="g.name + '进度'"
          />
        </div>
        <button
          :disabled="
            busy || (!m.tracked.includes(g.id) && m.tracked.length >= 3)
          "
          :aria-pressed="m.tracked.includes(g.id)"
          @click="
            run('trackCollectionGoal', {
              goalId: g.id,
              tracked: !m.tracked.includes(g.id),
            })
          "
        >
          {{ m.tracked.includes(g.id) ? "取消追踪" : "追踪目标" }}
        </button>
      </article>
      <p class="rules-note">
        完成养殖与发现属性组合会提高自然变异概率。晶露在收获真实生产批次时领取：每位伙伴每个产出日一次，全牧场该产出日最多3枚。新手赠送和功能启用前产物不计入。
      </p>
    </template>
  </section>
</template>
