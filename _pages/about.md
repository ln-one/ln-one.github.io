---
title: "About"
layout: page
permalink: /about/
---

<div class="page-heading" markdown="0">
<h1>About</h1>
<a class="cv-link" href="{{ site.links.cv | prepend: '/' | relative_url }}">{% include icon.html name="cv" %} View CV <span>PDF</span></a>
</div>

<div class="biography" markdown="0">{% include biography.html %}</div>

{% include research-interests.html %}

## Education

<div class="education-entry" markdown="0">
<div class="education-heading">
<h3>{{ site.institution }}</h3>
<p class="education-date">{{ site.data.profile.education.start }} – {{ site.data.profile.education.end }} <span>(expected)</span></p>
</div>
<p class="education-degree">{{ site.data.profile.education.degree }}</p>
<p>{{ site.data.profile.education.school }}</p>
<p class="education-location">{{ site.data.profile.education.location }}</p>
</div>
