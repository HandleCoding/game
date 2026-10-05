<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import type {
  RanchAnimalView,
  RanchCollectionPage,
} from "../../../../../packages/contracts/src/ranch";
import { api } from "../../platform/lobby";
import AnimalPortrait from "./AnimalPortrait.vue";
import RanchTraits from "./RanchTraits.vue";
const props = defineProps<{
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<boolean>;
}>();
const animals = ref<RanchAnimalView[]>([]),
  loading = ref(false),
  error = ref(""),
  search = ref(""),
  ids = ref<string[]>([]),
  main = ref(""),
  mode = ref("inherit"),
  retained = ref(""),
  confirmation = ref(false);
type Preview = {
  targetGrade: number;
  coins: number;
  dew: number;
  affordable: boolean;
  revision: number;
  attributes: string[];
};
const preview = ref<Preview | null>(null);
const next = ref<string | null>(null),
  total = ref(0);
let loadSequence = 0,
  searchTimer: ReturnType<typeof setTimeout> | undefined;
const mainAnimal = computed(() =>
  animals.value.find((a) => a.id === main.value),
);
const required = computed(() => ((mainAnimal.value?.grade ?? 0) >= 2 ? 3 : 2));
const material = computed(() =>
  animals.value.filter((a) => ids.value.includes(a.id)),
);
const candidates = computed(() =>
  animals.value.filter(
    (a) =>
      (!search.value || a.name.includes(search.value)) &&
      (!mainAnimal.value ||
        (a.species === mainAnimal.value.species &&
          (a.grade ?? 0) === (mainAnimal.value.grade ?? 0))),
  ),
);
const payload = () => ({
  animalIds: ids.value,
  mainAnimalId: main.value,
  mode: mode.value,
  ...(mode.value === "random" && mainAnimal.value?.attributes?.length === 2
    ? { retainedAttribute: retained.value }
    : {}),
  recipeVersion: 1,
});
let seq = 0;
async function load(more = false) {
  const sequence = ++loadSequence;
  loading.value = true;
  error.value = "";
  const chosen = animals.value.filter((a) => ids.value.includes(a.id));
  try {
    const q = new URLSearchParams({
      mode: "hall",
      fusion: "1",
      search: search.value,
    });
    if (more && next.value) q.set("after", next.value);
    if (mainAnimal.value) {
      q.set("species", mainAnimal.value.species);
      q.set("grade", String(mainAnimal.value.grade ?? 0));
    }
    const page = await api<RanchCollectionPage>(
      "games/animal-ranch/me/collection?" + q,
    );
    if (sequence !== loadSequence) return;
    animals.value = [
      ...new Map(
        [...(more ? animals.value : chosen), ...page.animals].map((a) => [
          a.id,
          a,
        ]),
      ).values(),
    ];
    next.value = page.next;
    total.value = page.total;
  } catch (e) {
    if (sequence === loadSequence) error.value = (e as Error).message;
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void load(), 250);
});
watch(
  () => main.value,
  () => void load(),
);
onBeforeUnmount(() => {
  ++loadSequence;
  clearTimeout(searchTimer);
});

function toggle(a: RanchAnimalView) {
  confirmation.value = false;
  if (ids.value.includes(a.id)) {
    ids.value = ids.value.filter((id) => id !== a.id);
    if (main.value === a.id) main.value = ids.value[0] || "";
  } else if (ids.value.length < required.value) {
    ids.value = [...ids.value, a.id];
    if (!main.value) main.value = a.id;
  }
}
async function getPreview() {
  const n = ++seq;
  preview.value = null;
  confirmation.value = false;
  error.value = "";
  if (ids.value.length !== required.value || !main.value) return;
  try {
    const p = await api<Preview>(
      "games/animal-ranch/fusion-preview",
      payload(),
    );
    if (n === seq) preview.value = p;
  } catch (e) {
    if (n === seq) error.value = (e as Error).message;
  }
}
watch([ids, main, mode, retained], () => void getPreview());
watch(mainAnimal, (a) => {
  retained.value = a?.attributes?.[0] || "";
});
async function fuse() {
  if (await props.run("fuseAnimals", payload())) {
    ids.value = [];
    main.value = "";
    preview.value = null;
    confirmation.value = false;
    await load();
  } else {
    await load();
    await getPreview();
  }
}
onMounted(() => void load());
const names: Record<string, string> = {
  lightning: "雷",
  fire: "火",
  water: "水",
  gold: "黄金",
  dream: "梦幻",
};
</script>
<template>
  <section class="ranch-modern fusion-root" aria-label="名宠融合">
    <div class="collection-summary">
      <div>
        <small>收藏的新可能</small>
        <h3>让伙伴成为更高品质</h3>
        <p>同物种、同品质：普通与优秀需要2位；史诗与传奇需要3位。</p>
      </div>
    </div>
    <p class="rules-note">
      主伙伴保留编号、昵称与成长档案，其他材料会被消耗并留档。融合不会恢复生产。已珍藏或无双伙伴不会出现在材料列表。
    </p>
    <div class="fusion-layout">
      <div>
        <div class="fusion-toolbar">
          <input
            v-model="search"
            type="search"
            placeholder="搜索伙伴"
            aria-label="搜索融合材料"
          /><button
            :disabled="busy || loading"
            @click="
              ids = [];
              main = '';
              load();
            "
          >
            重新选择
          </button>
        </div>
        <p v-if="loading">正在读取名宠堂…</p>
        <p v-if="!loading && !animals.length" class="modern-empty">
          先让完成养殖的伙伴进入名宠堂，再来试试融合。
        </p>
        <div class="fusion-grid">
          <button
            v-for="a in candidates"
            :key="a.id"
            class="fusion-card"
            :aria-pressed="ids.includes(a.id)"
            :disabled="
              busy || loading || (!ids.includes(a.id) && ids.length >= required)
            "
            @click="toggle(a)"
          >
            <AnimalPortrait
              :species="a.species"
              :attributes="a.attributes"
              :name="a.name"
              :baby="false"
            /><strong>{{ a.name }}</strong
            ><RanchTraits
              :grade="a.grade"
              :attributes="a.attributes"
            /><small>{{
              main === a.id
                ? "主伙伴"
                : ids.includes(a.id)
                  ? "已选材料"
                  : "选择材料"
            }}</small>
          </button>
        </div>
        <button
          v-if="next"
          class="modern-primary"
          :disabled="loading || busy"
          @click="load(true)"
        >
          加载更多材料（共 {{ total }} 位）
        </button>
      </div>
      <aside class="modern-detail">
        <h3>融合预览 · {{ ids.length }} / {{ required }}</h3>
        <template v-if="mainAnimal"
          ><label
            >保留哪位作为主伙伴？<select
              v-model="main"
              aria-label="选择融合主伙伴"
            >
              <option v-for="a in material" :key="a.id" :value="a.id">
                {{ a.name }} · {{ a.id.slice(0, 6) }}
              </option>
            </select></label
          ><label
            >属性处理<select v-model="mode" aria-label="融合属性方式">
              <option value="inherit">继承主伙伴属性</option>
              <option value="random">随机一个新属性</option>
            </select></label
          ><label
            v-if="mode === 'random' && mainAnimal.attributes?.length === 2"
            >保留一个属性<select v-model="retained" aria-label="保留的属性">
              <option v-for="a in mainAnimal.attributes" :key="a" :value="a">
                {{ names[a] }}
              </option>
            </select></label
          >
          <p class="quiet">
            {{
              mode === "inherit"
                ? "属性保持不变，品质必定提高一级。"
                : "单属性重新随机；双属性保留一个，另一个从其余属性中随机。随机额外消耗晶露。"
            }}
          </p></template
        ><template v-if="preview"
          ><RanchTraits
            :grade="preview.targetGrade"
            :attributes="
              mode === 'inherit'
                ? preview.attributes
                : mainAnimal?.attributes?.length === 2 && retained
                  ? [retained]
                  : []
            "
          />
          <p v-if="mode === 'random'">
            {{
              mainAnimal?.attributes?.length === 2 ? "另一个属性" : "完整属性"
            }}在确认融合时重新随机；可能仍得到原属性，预览不会抽取。
          </p>
          <p class="fusion-cost">
            <strong>{{ preview.coins }}</strong> 金币 +
            <strong>{{ preview.dew }}</strong> 晶露
          </p>
          <p v-if="!preview.affordable" role="status">
            金币或晶露不足，先收获和出售产物。
          </p>
          <button
            class="modern-primary"
            :disabled="busy || loading || !preview.affordable"
            @click="confirmation = true"
          >
            确认材料与消耗
          </button></template
        >
        <p v-else class="quiet">选择足够的材料后，显示服务器计算的准确消耗。</p>
      </aside>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <div
      v-if="confirmation && preview"
      class="modern-confirm"
      role="alertdialog"
      aria-label="确认名宠融合"
    >
      <strong
        >融合为{{
          ["普通", "优秀", "史诗", "传奇", "无双"][preview.targetGrade]
        }}？</strong
      >
      <p>
        保留「{{ mainAnimal?.name }}」，消耗另外{{ required - 1 }}位伙伴及{{
          preview.coins
        }}金币、{{ preview.dew }}晶露。材料消耗后不能找回，成长档案会保留。
      </p>
      <button class="modern-primary" :disabled="busy || loading" @click="fuse">
        确认融合</button
      ><button :disabled="busy" @click="confirmation = false">取消</button>
    </div>
  </section>
</template>
