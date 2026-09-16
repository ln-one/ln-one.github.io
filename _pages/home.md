---
title: "Home"
layout: homelay
permalink: /
---

<div class="desktop-only" markdown="1">
<h1 class="home-hero" id="desktop-home-name">{{ site.name }}</h1>

<div class="biography" markdown="0">{% include biography.html %}</div>

{% include research-interests.html %}

</div>

## Selected work

<div class="section-card selected-work" markdown="0">
{% bibliography --query @*[selected=true] --template work-item --max 4 %}
<p class="all-publications"><a href="{{ '/publications/' | relative_url }}">All publications &rarr;</a></p>
</div>
