---
title: "Home"
layout: homelay
permalink: /
research_title: "Information Retrieval, Data Mining & AI"
---

<div class="desktop-only" markdown="1">
<h1 class="home-hero" id="desktop-home-name">{{ site.name }}</h1>

Studying computer science. Interested in cognition, psychology, and philosophy. Enjoy reading [Dostoevsky](https://en.wikipedia.org/wiki/Fyodor_Dostoevsky)’s books. Most inspired by [*Gödel, Escher, Bach*](https://en.wikipedia.org/wiki/G%C3%B6del,_Escher,_Bach).

<div class="chip-container" role="group" aria-label="Research interests" markdown="0">
<a class="chip" href="https://en.wikipedia.org/wiki/Artificial_intelligence" title="Artificial Intelligence on Wikipedia">Artificial Intelligence</a>
<a class="chip" href="https://en.wikipedia.org/wiki/Information_retrieval" title="Information Retrieval on Wikipedia">Information Retrieval</a>
<a class="chip" href="https://en.wikipedia.org/wiki/Data_mining" title="Data Mining on Wikipedia">Data Mining</a>
</div>



</div>

## Selected work

<div class="section-card selected-work" markdown="0">
{% bibliography --query @*[selected=true] --template work-item %}
<p class="all-publications"><a href="{{ '/publications/' | relative_url }}">All publications &rarr;</a></p>
</div>
