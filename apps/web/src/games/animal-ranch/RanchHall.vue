<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from "vue";
import RanchFusion from "./RanchFusion.vue";
import RanchTraits from "./RanchTraits.vue";
import AnimalPortrait from "./AnimalPortrait.vue";
import { api } from "../../platform/lobby";
import type {
  RanchAnimalView,
  RanchCollectionPage,
  RanchAnimalRecord,
} from "../../../../../packages/contracts/src/ranch";
const props = defineProps<{
  ownerId: string;
  isOwner: boolean;
  busy: boolean;
  run: (type: string, payload: Record<string, unknown>) => Promise<boolean>;
}>();
const mode = ref("hall"),
  search = ref(""),
  page = ref<RanchCollectionPage>({ animals: [], next: null, total: 0 }),
  loading = ref(false),
  error = ref("");
const selected = ref<RanchAnimalView | null>(null),
  record = ref<RanchAnimalRecord | null>(null),
  nickname = ref(""),
  confirmation = ref<"sellAnimal" | "releaseAnimal" | null>(null);
const detailElement = ref<HTMLElement | null>(null);
let sequence = 0;
const endpoint = () =>
  "games/animal-ranch/" +
  (props.isOwner ? "me" : "players/" + encodeURIComponent(props.ownerId));
async function load(after = "") {
  const seq = ++sequence;
  loading.value = true;
  error.value = "";
  try {
    const q = new URLSearchParams({
      mode: mode.value,
      search: search.value.trim(),
      after,
    });
    const result = await api<RanchCollectionPage>(
      endpoint() + "/collection?" + q,
    );
    if (seq === sequence) page.value = result;
  } catch (e) {
    if (seq === sequence) error.value = (e as Error).message;
  } finally {
    if (seq === sequence) loading.value = false;
  }
}
async function pick(a: RanchAnimalView) {
  selected.value = a;
  nickname.value = a.nickname;
  record.value = null;
  confirmation.value = null;
  try {
    const r = await api<RanchAnimalRecord>(
      endpoint() + "/animals/" + encodeURIComponent(a.id),
    );
    if (selected.value?.id === a.id) {
      record.value = r;
      selected.value = r.animal;
      await nextTick();
      if (innerWidth <= 700)
        detailElement.value?.scrollIntoView({ block: "start" });
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function act(type: string, payload: Record<string, unknown>) {
  if (await props.run(type, payload)) {
    confirmation.value = null;
    await load();
    if (selected.value) {
      const a = page.value.animals.find((a) => a.id === selected.value!.id);
      if (a) await pick(a);
      else selected.value = null;
    }
  }
}
const labels = {
  juvenile: "幼年成长",
  producing: "生产中",
  completed: "生产已完成",
  hall: "名宠堂",
  sold: "已出售",
  released: "已放生",
  fused: "已融合",
};
function date(t: number | null) {
  return t === null
    ? "早期日期未记录"
    : new Date(t).toLocaleString("zh-CN", { hour12: false });
}
watch(mode, () => {
  selected.value = null;
  record.value = null;
  if (mode.value !== "fusion") void load();
});
onMounted(() => void load());
</script>
<template>
  <section class="hall-root" aria-label="名宠堂收藏">
    <div class="hall-tabs">
      <button :class="{ active: mode === 'hall' }" @click="mode = 'hall'">
        名宠堂
      </button>
      <button
        v-if="isOwner"
        :class="{ active: mode === 'history' }"
        @click="mode = 'history'"
      >
        成长档案
      </button>
      <button
        v-if="isOwner"
        :class="{ active: mode === 'fusion' }"
        @click="mode = 'fusion'"
      >
        名宠融合
      </button>
      <span v-if="mode !== 'fusion'">{{ page.total }} 位伙伴</span>
    </div>
    <RanchFusion v-if="mode === 'fusion'" :busy="busy" :run="run" />
    <template v-else>
      <form class="hall-search" @submit.prevent="load()">
        <input
          v-model="search"
          type="search"
          maxlength="40"
          placeholder="搜索昵称或动物"
          aria-label="搜索名宠堂"
        />
        <button :disabled="loading" type="submit">查找</button>
      </form>
      <p class="hall-intro">
        {{
          isOwner
            ? "这里保存陪你完成养殖的伙伴，不耗粮、不占生产位置。可选6位向来访者展示。"
            : "这里只展示牧场主公开的名宠堂伙伴。"
        }}
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="hall-layout">
        <div class="hall-list" :aria-busy="loading">
          <button
            v-for="a in page.animals"
            :key="a.id"
            class="hall-card"
            :class="{ selected: selected?.id === a.id }"
            @click="pick(a)"
            :aria-label="'查看名宠堂伙伴' + a.name"
          >
            <AnimalPortrait
              :species="a.species"
              :attributes="a.attributes"
              :name="a.name"
              :baby="a.baby"
            />
            <RanchTraits
              :grade="a.grade"
              :attributes="a.attributes"
              :protected="a.protected"
            />
            <strong>{{ a.name }}</strong
            ><small
              >{{ labels[a.status] }}{{ a.display ? " · 已展示" : "" }}</small
            >
            <small>已生产 {{ a.completedRounds }} / {{ a.maxRounds }} 轮</small>
          </button>
          <p v-if="!page.animals.length && !loading" class="hall-empty">
            {{
              mode === "hall"
                ? "还没有名宠堂伙伴。完成全部生产后，就可以让它住进来。"
                : "还没有符合条件的成长记录。"
            }}
          </p>
          <button
            v-if="page.next"
            class="hall-more"
            :disabled="loading"
            @click="load(page.next!)"
          >
            下一页
          </button>
          <button
            v-if="page.animals.length"
            class="hall-more"
            :disabled="loading"
            @click="load()"
          >
            回到第一页
          </button>
        </div>
        <aside ref="detailElement" class="hall-details">
          <template v-if="selected">
            <div class="hall-portrait">
              <AnimalPortrait
                :species="selected.species"
                :attributes="selected.attributes"
                :name="selected.name"
                :baby="selected.baby"
              />
            </div>
            <h3>{{ selected.name }}</h3>
            <p>{{ labels[selected.status] }}</p>
            <RanchTraits
              :grade="selected.grade"
              :attributes="selected.attributes"
              :protected="selected.protected"
            />
            <dl>
              <div>
                <dt>生产轮次</dt>
                <dd>
                  {{ selected.completedRounds }} / {{ selected.maxRounds }}
                </dd>
              </div>
              <div>
                <dt>累计产量</dt>
                <dd>
                  {{
                    selected.totalProduced === null
                      ? "早期累计未知"
                      : selected.totalProduced + " 份"
                  }}
                </dd>
              </div>
              <div>
                <dt>认养时间</dt>
                <dd>{{ date(selected.createdAt) }}</dd>
              </div>
              <div v-if="selected.completedAt">
                <dt>完成时间</dt>
                <dd>{{ date(selected.completedAt) }}</dd>
              </div>
            </dl>
            <template
              v-if="
                isOwner &&
                !['sold', 'released', 'fused'].includes(selected.status)
              "
            >
              <button
                :disabled="busy || loading"
                @click="
                  act('setAnimalProtected', {
                    animalId: selected.id,
                    protected: !selected.protected,
                  })
                "
              >
                {{ selected.protected ? "解除珍藏保护" : "珍藏保护" }}
              </button>
              <form
                class="hall-rename"
                @submit.prevent="
                  act('renameAnimal', { animalId: selected!.id, nickname })
                "
              >
                <input
                  v-model="nickname"
                  maxlength="24"
                  aria-label="名宠堂伙伴昵称"
                  placeholder="给它取个名字（最多12字）"
                />
                <button type="submit" :disabled="busy || loading">
                  保存名字
                </button>
              </form>
              <template v-if="selected.status === 'hall'">
                <button
                  :disabled="busy || loading"
                  @click="
                    act('setHallDisplay', {
                      animalId: selected.id,
                      display: !selected.display,
                    })
                  "
                >
                  {{ selected.display ? "取消公开展示" : "展示给来访者" }}
                </button>
                <div class="hall-exits">
                  <button
                    :disabled="busy || loading || selected.protected"
                    @click="confirmation = 'sellAnimal'"
                  >
                    出售 · {{ selected.saleCoins }} 金币</button
                  ><button
                    :disabled="busy || loading || selected.protected"
                    @click="confirmation = 'releaseAnimal'"
                  >
                    放生
                  </button>
                </div>
              </template>
            </template>
            <div
              v-if="confirmation"
              class="hall-confirm"
              role="alertdialog"
              aria-label="确认伙伴去向"
            >
              <strong
                >{{
                  confirmation === "sellAnimal" ? "确认出售" : "确认放生"
                }}「{{ selected.name }}」？</strong
              >
              <p>
                {{
                  confirmation === "sellAnimal"
                    ? "获得 " + selected.saleCoins + " 金币。"
                    : "不获得出售金币。"
                }}伙伴将离开，纪念记录保留，不能重新认领。
              </p>
              <button
                :disabled="busy || loading"
                @click="act(confirmation, { animalId: selected!.id })"
              >
                确认{{
                  confirmation === "sellAnimal" ? "出售" : "放生"
                }}</button
              ><button :disabled="busy" @click="confirmation = null">
                取消
              </button>
            </div>
            <h4 v-if="isOwner">成长日记</h4>
            <ol class="hall-events">
              <li v-for="e in record?.events || []" :key="e.id">
                <span>{{ e.message }}</span
                ><small>{{ date(e.at) }}</small>
              </li>
            </ol>
          </template>
          <p v-else class="hall-empty">选择一位伙伴，看看它的成长故事。</p>
        </aside>
      </div>
    </template>
  </section>
</template>
<style scoped>
.hall-root {
  color: var(--ink, #6c4b2e);
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}
.hall-tabs,
.hall-search,
.hall-rename,
.hall-exits {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.hall-root button {
  min-height: 44px;
  border: 2px solid #d6b986;
  border-radius: 12px;
  padding: 8px 12px;
  background: var(--paper, #fff4d8);
  color: var(--ink, #6c4b2e);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.hall-root button:disabled {
  opacity: 0.55;
  cursor: default;
}
.hall-tabs .active,
.hall-card.selected {
  border-color: #86ab39;
  background: #ecf2c8;
  color: #4b622a;
}
.hall-tabs span {
  margin-left: auto;
  font-size: 13px;
}
.hall-search {
  margin: 12px 0;
}
.hall-root input {
  min-width: 0;
  flex: 1;
  width: 100%;
  min-height: 44px;
  background: var(--paper, #fff8e4);
  color: var(--ink, #6c4b2e);
  border: 2px solid #d6b986;
  border-radius: 12px;
  padding: 8px 12px;
  font: inherit;
}
.hall-intro {
  font-size: 13px;
  line-height: 1.6;
}
.hall-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  max-height: none;
  overscroll-behavior: contain;
}
.hall-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  align-content: start;
}
.hall-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.hall-card :deep(svg) {
  width: 100%;
  height: 110px;
}
.hall-card strong {
  overflow-wrap: anywhere;
}
.hall-card small {
  font-size: 11px;
  line-height: 1.7;
}
.hall-details {
  background: var(--paper, #fff6dc);
  border: 2px solid #dfcba2;
  border-radius: 16px;
  padding: 14px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.hall-portrait {
  height: 150px;
  text-align: center;
}
.hall-portrait :deep(svg) {
  height: 100%;
  width: 100%;
}
.hall-details h3 {
  text-align: center;
  margin: 8px 0;
}
.hall-details dl div {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  font-size: 12px;
  margin: 8px 0;
}
.hall-details dd {
  margin: 0;
  text-align: right;
}
.hall-rename {
  margin: 14px 0;
}
.hall-confirm {
  background: var(--paper, #f9e4c1);
  border: 2px solid #ce966a;
  border-radius: 12px;
  padding: 12px;
  margin: 12px 0;
}
.hall-confirm p {
  font-size: 13px;
}
.hall-confirm button {
  margin-right: 8px;
}
.hall-events {
  padding-left: 20px;
  font-size: 13px;
}
.hall-events small {
  display: block;
  font-size: 11px;
  color: var(--soft-ink, #8d7859);
  margin: 4px 0 12px;
}
.hall-empty {
  grid-column: 1/-1;
  padding: 16px;
  text-align: center;
  line-height: 1.8;
}
.hall-more {
  grid-column: 1/-1;
}
@media (max-width: 700px) {
  .hall-layout {
    grid-template-columns: 1fr;
    max-height: none;
  }
  .hall-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .hall-card {
    padding: 6px !important;
  }
  .hall-card :deep(svg) {
    height: 76px;
  }
  .hall-card strong {
    font-size: 13px;
  }
  .hall-card small {
    font-size: 10px;
  }
  .hall-portrait {
    height: 120px;
  }
}
@media (max-width: 350px) {
  .hall-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
