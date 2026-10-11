# Why the explainer has these parts

Section 4 of the skill names the parts of the explainer and their order. This
file gives the evidence for each part, and the detail that the list has no
room for. A rule with no source is marked **judgement**. The sources are
listed at the end.

## What a reviewer needs

Reviewers say their main problem is to understand the change, and above all
why it was made. Understanding takes most of the review time, and comments
about defects are only the fourth most common kind (14%) [Bacchelli and Bird].
When an author gives context and direction, reviewers answer better and
faster [Bacchelli and Bird]. The rationale of a change is the information that
helps most to understand it [Tao et al.]. So the explainer gives four things,
in this order:

1. The reason for the change.
2. An overview, with the change marked in place.
3. A route through the diff.
4. The places outside the diff that the change can break.

The explainer points at the code and never replaces it. Some reviewers distrust
a description, because "people can say they are doing one thing, while they are
doing many more" [Bacchelli and Bird]. The Cisco study warns that prepared
prose can disable criticism: "as long as the code matches the prose, the
reviewer is satisfied" [Cohen]. That is why every statement comes from
`compare`, `footprint` and the diff, and why **Changed but not drawn** exists.

Keep the whole explainer short enough to read in a few minutes. An explanation
stays "closely bounded" [Diátaxis]. **Judgement** on the length.

## Size the review

Small changes are reviewed better:

- Review effectiveness is significantly larger for small changes
  [Baum et al. 2019].
- A reviewer finds fewer defects after 300 to 400 lines, and after about 60
  minutes [Cohen]. This is a vendor study, not peer-reviewed.
- 100 lines is usually reasonable, and 1000 lines is usually too large. The
  right size is "one self-contained change" [Google, small CLs].
- Over 40% of changes at Microsoft hold independent parts that can be split
  apart. Such tangled changes are harder to understand [Barnett et al.].

The 400 lines of section 4 is **judgement**, taken from the vendor figure. So
is what to leave out of the count.

Put the riskiest pass first. An experiment had 106 reviewers. A defect in the
file shown last had 64% lower odds of being found than in the file shown first
[Fregnan et al.].

Two more moves help a large review (**judgement**):

- If the work can still become separate pull requests, say once where to cut.
  Do not insist.
- If the passes carry different risks, name a perspective for each, such as a
  caller's view or an operator's view (failure, retry, migration). Readers who
  each had a perspective covered more of a document [Basili et al.]. That
  study read requirements, not code.

## The evidence for each part

**Why.** The first thing a reviewer wants to see is why [Ram et al.]. Not
knowing whether a change is an urgent fix or a nice-to-have causes
misunderstandings [Sadowski et al.]. A description states the problem, why
this is the best approach, and any shortcoming [Google, CL descriptions].
Record the alternatives you rejected, and why [Parnas and Clements, Clements
et al.].

**The after render.** Reviewers want an overview at the start [Baum et al.
2017]. Google tells a reviewer to look first at what the change does in
general, then at its main parts [Google, navigating a CL]. A diagram groups the
facts that are used together, and saves the search that a list of names needs
[Larkin and Simon]. Every diagram needs a title and a key that explains every
symbol [Clements et al., C4 notation]. What the overview draws depends on what
the change moves. The 4+1 model keeps the logical, process, development and
physical views apart. It illustrates them with scenarios, whose scripts are
"sequences of interactions between objects, and between processes" [Kruchten]. So a change of structure gets an
architecture picture, and a change of behaviour, order or process gets the
sequence of the flow it changes. Which one a change needs is **judgement**.

**The walkthrough.** Its place beside the render, before the lists, is
**judgement**: it is a second way into the same overview.
[walkthrough.md](walkthrough.md) has its evidence.

**What changed.** Use the board's names, so each line can be found on the
picture [Larkin and Simon]. A reader who must match a list against a picture by
names that the picture does not carry splits attention [Sweller].

**Changed but not drawn.** This part guards against prose that says less than
the code does [Bacchelli and Bird, Cohen].

**What it can reach.** "Does this change break any code elsewhere?" is a
question that reviewers find hard to answer [Tao et al.]. Defects that span
several places depend on the reviewer's working memory [Baum et al. 2019]. A
reading that follows the dependencies finds them more often [Dunsmore]. The
board holds the relationships that working memory drops. Make each question
concrete. An example: "Does `Pane` still read the version before it writes?"

**Reading order.** GitHub shows the files alphabetically, and files shown first
get more comments [Fregnan et al.]. In interviews and a survey, reviewers asked
for related change parts grouped together, and for information before it is
needed. 85% preferred bottom-up along the call flow. An order with no visible
rule was among the worst rated [Baum et al. 2017]. If grouping and order
conflict, keep the group [Baum et al. 2017]. In a controlled experiment, the
effect of order was only a tendency [Baum et al. 2019], so keep the list short.

**Where to look closely.** Good context says where reviewers must pay special
attention [GitHub, helping others review]. The file a reviewer meets last gets
the least attention [Fregnan et al.], so name the place.

## Anti-patterns

Each of these makes the review slower or less thorough:

- Prose about what you meant instead of what the code does. It invites the
  reader to check the code against the prose and stop there [Cohen].
- Files listed in diff order or alphabetically as the reading order
  [Fregnan et al., Baum et al. 2017].
- A whole board squeezed into the column, or a render with no title and no key
  [Clements et al., C4 notation]. See [renders.md](renders.md).
- Before and after side by side. Each variant is laid out afresh, so cards move
  between the two pictures and do not line up.
- The history of the pull request told step by step. Readers want to understand
  the result, not relive its discovery [Parnas and Clements].
- A verdict ("this is safe") in place of a place to look.
- A video for a change of one or two parts, a video over about three minutes,
  or a beat that makes several points [Sweller, Guo et al., Mayer and Moreno].
  See [walkthrough.md](walkthrough.md).

## Sources

- Bacchelli and Bird: A. Bacchelli, C. Bird, "Expectations, Outcomes, and
  Challenges of Modern Code Review", ICSE 2013, §VI and §VII.
  <https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE202013-codereview.pdf>
- Sadowski et al.: C. Sadowski et al., "Modern Code Review: A Case Study at
  Google", ICSE-SEIP 2018. <https://sback.it/publications/icse2018seip.pdf>
- Tao et al.: Y. Tao et al., "How Do Software Engineers Understand Code
  Changes?", FSE 2012.
  <https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf>
- Ram et al.: A. Ram et al., "What Makes a Code Change Easier to Review",
  FSE 2018, §5.1.1. <https://sback.it/publications/fse2018.pdf>
- Barnett et al.: M. Barnett et al., "Helping Developers Help Themselves:
  Automatic Decomposition of Code Review Changesets", ICSE 2015.
  <https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/barnett2015hdh.pdf>
- Fregnan et al.: E. Fregnan et al., "First Come First Served: The Impact of
  File Position on Code Review", ESEC/FSE 2022.
  <https://arxiv.org/abs/2208.04259>
- Baum et al. 2017: T. Baum et al., "On the Optimal Order of Reading Source
  Code Changes for Review", ICSME 2017, §IV.
  <https://sback.it/publications/icsme2017.pdf>
- Baum et al. 2019: T. Baum et al., "Associating Working Memory Capacity and
  Code Change Ordering with Code Review Performance", EMSE 2019.
  <https://sback.it/publications/emse2019a.pdf>
- Dunsmore: A. Dunsmore, PhD thesis, University of Strathclyde 2002, §6.3.
  <https://strathprints.strath.ac.uk/2683/1/strathprints002683.pdf>
- Basili et al.: V. Basili et al., "The Empirical Investigation of
  Perspective-Based Reading", EMSE 1996.
  <http://www.cs.umd.edu/projects/SoftEng/ESEG/manual/pbr_package/docs/emp_pbr.ps.gz>
- Cohen: J. Cohen, "Code Review at Cisco Systems", SmartBear (vendor
  chapter).
  <https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf>
- Google, small CLs:
  <https://google.github.io/eng-practices/review/developer/small-cls.html>
- Google, CL descriptions:
  <https://google.github.io/eng-practices/review/developer/cl-descriptions.html>
- Google, navigating a CL:
  <https://google.github.io/eng-practices/review/reviewer/navigate.html>
- GitHub, helping others review:
  <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/helping-others-review-your-changes>
- Parnas and Clements: D. Parnas, P. Clements, "A Rational Design Process:
  How and Why to Fake It", IEEE TSE 1986, §V to §VII.
  <https://users.ece.utexas.edu/~perry/education/SE-Intro/fakeit.pdf>
- Clements et al.: P. Clements et al., _Documenting Software Architectures:
  Views and Beyond_, Prologue, rules 3a and 5.
  <https://www.informit.com/articles/article.aspx?p=1641654&seqNum=5>
- C4 notation: <https://c4model.com/diagrams/notation>
- Kruchten: P. Kruchten, "The 4+1 View Model of Architecture", IEEE Software
  1995, "Scenarios".
  <https://www.cs.ubc.ca/~gregor/teaching/papers/4+1view-architecture.pdf>
- Larkin and Simon: J. Larkin, H. Simon, "Why a Diagram is (Sometimes) Worth
  Ten Thousand Words", Cognitive Science 1987, §5.
  <https://mechanism.ucsd.edu/bill/teaching/F12/cs200/Readings/larkin.whyadiagramissometimesworth.1987.pdf>
- Sweller: J. Sweller, "Visualisation and Instructional Design", 2002.
  <https://nielsolson.us/STLHE020409/SwellerVisualizationAndInstructionalDesign.pdf>
- Diátaxis: <https://diataxis.fr/explanation/>
- Guo et al. and Mayer and Moreno: see
  [walkthrough.md](walkthrough.md#sources).
