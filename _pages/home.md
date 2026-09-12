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

## Selected preprints

<div class="section-card selected-pubs desktop-only" markdown="0">
{% bibliography --query @*[selected=true] %}
<p style="margin: var(--space-4) 0 0;"><a href="{{ '/publications/' | relative_url }}">All publications &rarr;</a></p>
</div>

<div class="home-research mobile-only" markdown="0">
{% bibliography --query @*[selected=true] --template research-card %}
<p class="all-publications"><a href="{{ '/publications/' | relative_url }}">All publications &rarr;</a></p>
</div>

## Guide

[Workflow, figures, and standards]({{ '/guide/' | relative_url }}).
