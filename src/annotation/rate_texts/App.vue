<script>
export default {
  data() {
    fetch(window.FILE_PATH || "/annotation_chunks.json")
      .then(response => response.json())
      .then(response => {
        let chunkIdx = window.chunk_idx || 0; // TODO: don't deploy with this.
        let chunk = response[chunkIdx];
        this.results = chunk.map(text => ({
          text,
          questionsAnswered: "",
          informativeness: "",
          appropriateness: "",
          firstMod: null,
          lastMod: null
        }));
      });
    return {
      results: []
    };
  },
  created() {},
  methods: {
    change(idx) {
      let now = +new Date();
      this.results[idx].lastMod = now;
      if (this.results[idx].firstMod === null) {
        this.results[idx].firstMod = now;
      }
    }
  }
};
</script>

<template>
  <div id="root">
    <div id="instructions">
      You'll see {{results.length}} articles written by different people. For each one, do three things:
      <p>First, list a few factual questions that the article provides an answer to.</p>
      <ul>
        <li>For example, if the article says "She was born in New York City", you could write "Where was she born?"</li>
        <li>List about 5 questions.</li>
      </ul>
      <p>
        Then, rate how
        <b>informative</b> the article is and how
        <b>appropriate</b> the writing would be for an encyclopedia article.
      </p>
      <ul>
        <li>Use a scale of 1 (least) to 10 (most).</li>
        <li>
          <b>Try to use a range of scores</b>.
        </li>
        <li>Use "10" for an article that would qualify as a "featured article" on Wikipedia.</li>
        <li>Use "1" for the worst article in this set of {{results.length}} articles, even if it's pretty good.</li>
      </ul>
    </div>
    <div id="task-container">
      <div v-if="results.length == 0">Loading...</div>
      <div v-else v-for="(r, idx) in results" :key="idx" class="article">
        <b>Article {{idx+1}} of {{results.length}}</b>
        <p class="article-text">{{r.text}}</p>
        <div class="responses">
          <label>
            Questions that this article has an answer to:
            <br>
            <textarea v-model="r.questionsAnswered" @change="change(idx)" rows="5"></textarea>
          </label>
          <label>
            Informativeness (10=most)
            <br>
            <input v-model="r.informativeness" @change="change(idx)" type="number" min="0" max="10">
          </label>
          <label>
            Appropriateness as encyclopedia article (10=most)
            <br>
            <input v-model="r.appropriateness" @change="change(idx)" type="number" min="0" max="10">
          </label>
        </div>
      </div>
    </div>

    <input type="hidden" name="results" :value="JSON.stringify(results)">
  </div>
</template>

<style>
.App {
  padding: 20px;
}

* {
  box-sizing: border-box;
}

#instructions {
  margin: 0 auto;
  max-width: 600px;
  padding: 20px;
  border: 1px solid black;
}

#task-container {
  max-width: 700px;
  margin: 0 auto;
}

.article {
  border: 1px solid #ccc;
  margin: 5px;
  padding: 5px;
}

.article-text {
  font-family: sans-serif;
  line-height: 1.5;
  margin: 5px auto;
  max-width: 600px;
}

.responses {
  display: flex;
  flex-flow: row nowrap;
  justify-content: flex-end;
}
.responses label {
  display: inline-block;
  max-width: 200px;
  padding: 5px;
  text-align: center;
}

.responses label textarea {
  width: 100%;
}
</style>
