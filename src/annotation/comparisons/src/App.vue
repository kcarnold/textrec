<script>
const NUM_PAIRS = window.NUM_PAIRS;

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default {
  data() {
    let results = [];
    for (let i = 0; i < NUM_PAIRS; i++) {
      results.push({ left: null, right: null, isLeft: null });
    }
    return {
      condPairs: window.DATA.condPairs,
      items: window.DATA.items[window.stimulusIdx].texts,
      curIdx: -1,
      done: false,
      results
    };
  },
  created() {
    this.newPair();
    document.onkeyup = event => {
      if (event.keyCode === 37) {
        this.select(0);
        event.preventDefault();
      } else if (event.keyCode === 39) {
        this.select(1);
        event.preventDefault();
      }
    };
  },
  methods: {
    select(idx) {
      if (this.done) return;
      let isLeft = idx === 0;
      this.results[this.curIdx].isLeft = isLeft;
      this.newPair();
    },
    selectOld(idx, isLeft) {
      this.results[idx].isLeft = isLeft;
      if (idx === this.curIdx) {
        this.newPair();
      }
    },
    newPair() {
      this.curIdx++;
      let [condA, condB] = this.condPairs[this.curIdx % this.condPairs.length];
      if (Math.random() < 0.5) {
        [condB, condA] = [condA, condB];
      }
      if (this.curIdx === NUM_PAIRS) {
        this.done = true;
        return;
      }
      let result = this.results[this.curIdx];
      result.left = choice(this.items[condA]);
      result.right = choice(this.items[condB]);
      result.isLeft = null;
    }
  }
};
</script>

<template>
  <div id="root">
    <table>
      <tr v-for="(r, idx) in results" :key="idx" class="results">
        <td :class="{selected: r.isLeft === true, cur: idx === curIdx}" @click="selectOld(idx, true)">
          {{r.left ? r.left.text : '...'}}
          <div class="instructions" v-if="idx === curIdx">
            <button type="button" v-on:click="select(0)">More specific</button>
            or press left-arrow
          </div>
        </td>
        <td :class="{selected: r.isLeft === false, cur: idx === curIdx}"  @click="selectOld(idx, false)">
          {{r.right ? r.right.text : '...'}}
          <div class="instructions" v-if="idx === curIdx">
            <button type="button" v-on:click="select(1)">More specific</button>
            or press right-arrow
          </div>
        </td>
      </tr>
    </table>

    <div v-if="done">
      Done! You can submit now.
    </div>

    <input type="hidden" :value="JSON.stringify(results)">
  </div>
</template>

<style>
.App {
  padding: 20px;
}

* {
  box-sizing: border-box;
}

table {
  max-width: 700px;
  margin: 0 auto;
  text-align: center;
}

td {
  cursor: pointer;
  margin: 20px;
  padding: 10px;
  width: 50%;
  vertical-align: bottom;
}

td.cur {
  padding: 40px 10px;
  font-size: 150%;
  line-height: 1.3;
}

.instructions button {
  display: block;
  margin: 0 auto;
  font-size: 200%;
  padding: 10px;
}

.selected {
  background: #ccc;
}
</style>
