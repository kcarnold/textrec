<script>
const chunk = [
  "A young student hitch-hiking home from college meets an old man with an incredible story to tell.Taken from his collection Tell Tale, A Wasted Hour is an ingenious and witty short story sure to delight Jeffrey Archer's many fans and proves why the Mail on Sunday has said that he is 'probably the greatest storyteller of our age'.If you loved this story be sure to look out for The Year of Short Stories, a collection of digital short stories which celebrate the talent of this incredible bestselling author, including The Endgame and The Man Who Robbed His Own Post Office.Even as a student Jeffrey Archer was plagued with rumours of financial wrongdoing \u2014 fellow undergraduates were amazed that he owned houses and cars with personalised number plates while working part time as an Oxfam fund raise",
  "1984 is a future world book made by George Orwell in 1949. The book was written about how in the future the government controls everyones actions. This is done started by the current leader, Emmanuel Goldstein. This world is surrounded by cameras and people who watch everything the citizens do. If they do not listen they are sent to the ministry of Love. This is really somewhere that people are killed who do not listen. While the name is odd, the government uses double speak which means the opposite of what it really means. The book revolves around Winston a factory worker and a 26 year old Julia who works in the ministry of truth. They both grow tired of their lives and want to leave the system. While it is thought impossible, they found a place that didnt have cameras. There they planned where to go. While in the last part of the plan, Julia has second thoughts and reports Winston to the police. He is taken to be re-educated then eventually is sent to the ministry of love. ",
  "God is Not Great is an informative look into the reason that God poisons every aspect of our lives. God has caused wars throughout the world. It works against homosexuality and progression to the human race. It has halted life saving stem cell research that could have made millions of peoples lives less miserable. God is not Great looks at the obvious flaws in the reasoning for people to have these odds belief. Christopher Hitchens dissects the sickness of fear that is instilled in children who have to confess to sins. He also takes a strong look at the grossness of having to circumcise children because of the dogma that religion has created on their culture.  He also looks into how people are moral without religion by default.",
  "This story is known as a tragedy. Our tragic hero's name is Roy Hobbs. He is a talented baseball player who strives to be a great ball player. As he is traveling to try out for a club he gets shot by this lady. He almost dies but he recovers and decides to pick up the game years later as a 33 year old. He plays for the New York Knights, a fictional baseball team, they're one of the worst teams in the league. He has his famous bat, Wonderboy, that helps him do well. The tragedy of the whole story is that Roy continues to make poor decisions in his life and his lack of maturity. He's only grasped to one thing, which is being the best ball player ever. His bad decision making leads him to lose it all after failing to realize that happiness was always in front of him and that baseball shouldn't of been his only goal. This was a famous book and won many awards.",
  "Ender's game is a 1985 science fiction book written by Orson Scott Card. It is 324 pages long. The book won the Hugo and Nebula awards. The protagonist of the book is Ender Wiggin who is sent to the Battle School after accidentally beating a bully to death. In the book, he plays a series of battle simulations which he excels at. The battle simulations are meant to prepare cadets to go to war with an insectoid alien race known as the Buggers. At the end of the book, Ender finds out that in his simulations he has actually been running real battles against the Buggers. The book spawned 8 direct sequels and 9 more novels that take place in the same universe. It also inspired a Hollywood adaptation.",
  "The Fellowship of the Rings is the first volume of The Lord of the Rings trilogy. The story takes place in the fictional world of Middle Earth, a place full of strange races, dangerous monsters, and dark shadows. Written in the early 20th century, the book has inspired millions and has been spun-off into many movies, games, and other forms of entertainment.\n\nThe main character is Frodo, a hobbit of Middle Earth. The story begins when Frodo's uncle Bilbo gives him a strange ring before disappearing into the night. Soon after Bilbo's old friend Gandalf arrives and tells Frodo that he must hide the ring. Soon Frodo is forced to leave his home with the ring, starting a dangerous journey across Middle Earth.\n\n",
  "Harry potter is the main protagonist in the story and his lives with his adoptive family that he does not like very much. He receives a letter from Hogwarts school of witchcraft and wizardy and he is summoned for the next school year. He is extremely excited about that opportunity and cannot wait to get there. Once he gets there he is confronted by his arch nemesis which is draco malfoy. He is fortunate that he meets a couple of good friends in the face of hermione and ron weasley. They help him navigate through life in hogwarts as he prepares for his first school year. He is also preparing for the day he is going to meet Lord Voldemort.",
  "Harry Potter and the Sorcerer's Stone is the first of seven books in the Harry Potter series by J.K. Rowling. The book was released in 1997 to acclaim and was later made into a popular movie. Harry Potter and the Sorcerer's Stone is a fictional, fantasy book. The book follows Harry Potter, a 12 year old boy who was orphaned when he was a baby when his parents were murdered. He now lives with his mean aunt and uncle and their son. One day, he finds out he is a wizard and goes off to the wizarding school, Hogwarts. There he meets his two best friends, Ron and Hermione, and together they navigate their first year at school. The climax of the book comes when Harry has to confront the evil wizard who murdered his parents.",
  "A Christmas Story is a book written by Charles Dickens.  It takes place during Christmas and is considered a classic.  In the book, a character named Scrooge is visited by the ghosts of Christmas past, present, and future in order to convince him to chance his ways.  He has been mean to an employee and is very frugal with money and bonuses.  He learns that his worker has a large family and a disabled child.  When he awakes from his dream, he realizes he should be a better person and wants to give back to his worker.  He buys Christmas dinner for the family and they are surprised to see him change his ways.  Working with Scrooge becomes a lot easier for his worker.",
  "Hitchhiker's Guide to the galaxy is a science fiction novel written by Douglas Adams in the late 1970's. It is about a common British man named Arthur Dent who wakes up one day to find that the Earth is about to be demolished to make way for a hyperspace bypass. His best friend rescues him and the pair end up on a spaceship travelling around the universe while Arthur attempts to make sense of what has just happened to his home. Along the way he meets a small but memorable cast of characters and the group have several adventures together. The story has a lot of humor and presents big questions about life in simple but humorous ways which any reader will enjoy."
];

export default {
  data() {
    let results = chunk.map(text => ({
      text,
      questionsAnswered: "",
      informativeness: "",
      appropriateness: "",
      firstMod: null,
      lastMod: null
    }));
    return {
      results
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
        <b>appropriate</b> the writing would be for an encyclopedia article, on a scale of 1 (least) to 10 (most).
        <b>Try to use a range of scores</b>.
      </p>
    </div>
    <div id="task-container">
      <div v-for="(r, idx) in results" :key="idx" class="article">
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
