<script>
function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default {
  data() {
    return {
      condPairs: window.DATA.condPairs,
      items: window.DATA.items[window.stimulusIdx].texts,
      curPair: null,
      results: [],
    };
  },
  created() {
    this.newPair();
    document.onkeyup = (event) => {
      if (event.keyCode === 37) {
        this.select(0);
        event.preventDefault();
      } else if (event.keyCode === 39) {
        this.select(1);
        event.preventDefault();
      }
    }
  },
  methods: {
    select(idx) {
      let [x0, x1] = this.curPair;
      this.results.push({
        left: x0,
        right: x1,
        isLeft: idx === 1
      });
      this.newPair();
    },
    selectOld(idx, isLeft) {
      this.results[idx].isLeft = isLeft;
    },
    newPair() {
      let [condA, condB] = this.condPairs[this.results.length % this.condPairs.length];
      if (Math.random() < 0.5) {
        // TODO: Make sure this works.
        [condB, condA] = [condA, condB];
      }
      this.curPair = [
        choice(this.items[condA]),
        choice(this.items[condB])
      ];
    }
  }
};
</script>

<template>
  <div id="root">
    <div v-if="curPair === null">
      Loading...
    </div>
    <table v-else>
      <tr class="curPair">
        <td>{{curPair[0].text}}</td>
        <td>{{curPair[1].text}}</td>
      </tr>
      <tr class="instructions">
        <td>
          <button type="button" v-on:click="select(0)">More specific</button>
          or press left-arrow
        </td>
        <td>
          <button type="button" v-on:click="select(1)">More specific</button>
          or press right-arrow
        </td>
      </tr>

      <tr v-for="(r, idx) in results" :key="idx" class="prevResults">
        <td :class="{selected: !r.isLeft}" @click="selectOld(idx, false)">{{r.left.text}}</td>
        <td :class="{selected: r.isLeft}"  @click="selectOld(idx, true)">{{r.right.text}}</td>
      </tr>
    </table>

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

.curPair td {
  margin: 20px;
  padding: 10px;
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

.prevResults td {
  cursor: pointer;
}
</style>
