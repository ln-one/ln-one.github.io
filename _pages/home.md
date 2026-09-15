---
title: "Home"
layout: homelay
permalink: /
research_title: "Information Retrieval, Data Mining & AI"
---

<div class="desktop-only" markdown="1">
<h1 class="home-hero" id="desktop-home-name">{{ site.name }}</h1>

Undergraduate at **Southwest Jiaotong University**.

<div class="chip-container" role="group" aria-label="Research interests" markdown="0">
<span class="chip">Artificial Intelligence</span>
<span class="chip">Data Mining</span>
<span class="chip">Information Retrieval</span>
</div>

</div>

## Selected work

<div class="section-card selected-work" markdown="0">
{% bibliography --query @*[selected=true] --template work-item %}
<p class="all-publications"><a href="{{ '/publications/' | relative_url }}">All publications &rarr;</a></p>
</div>
