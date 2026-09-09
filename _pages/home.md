---
title: "Home"
layout: homelay
permalink: /
---

<h1 class="home-hero">{{ site.name }}</h1>

Undergraduate at **Southwest Jiaotong University**.

<div class="chip-container" role="group" aria-label="Research interests" markdown="0">
<span class="chip">Artificial Intelligence</span>
<span class="chip">Data Mining</span>
<span class="chip">Information Retrieval</span>
</div>

## Selected preprints

<div class="section-card selected-pubs" markdown="0">
{% bibliography --query @*[selected=true] %}
<p style="margin: var(--space-4) 0 0;"><a href="{{ '/publications/' | relative_url }}">All publications &rarr;</a></p>
</div>

