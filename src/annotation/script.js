var res = Vue.compile(template);

var procData = _.map(taskData, function(page, pageIdx) {
  return {
    pageIdx: pageIdx,
    description: page.description,
    guesses: [],
    images: _.shuffle(_.map(page.images, function(url, idx) {
      return {
        idx: idx,
        url: url,
        isCorrect: idx === page.correct_idx,
        alreadyGuessed: false
      }
    }))
  };
});


var app = new Vue({
    el: "#app",
    render: res.render,
    staticRenderFns: res.staticRenderFns,
    data: {
        tasks: procData,
        taskIdx: 0,
        consentVisible: false,
        isDone: false
    },
    computed: {
      curTask: function() {
        return this.tasks[this.taskIdx];
      }
    },
    methods: {
      toggleConsent: function() {
        this.consentVisible = !this.consentVisible;
      },

      guessImage: function(idx) {
        var img = this.curTask.images[idx];
        this.curTask.guesses.push({
          idx: img.idx,
          shownIdx: idx,
          timestamp: +new Date()
        });
        img.alreadyGuessed = true;
        if (img.isCorrect) {
          alert("Great!");
          if (this.taskIdx === this.tasks.length - 1) {
            this.isDone = true;
          } else {
            this.taskIdx++;
            // this.curTask.guesses.push({
            //   idx: null,
            //   shownIdx: null,
            //   timestamp: +new Date();
            // })
          }
          window.scrollTo(0, 0);
        } else {
          alert("Oops, try again!");
        }
      }
    }
});
