> The intent of this is great, and I can tell you've put in work to try and fix most of the edge cases here. However, there are some you may not know about, and some are outright unavoidable.
>
> It might take a bit for me to review this all, so I'll leave you with these cases to consider for now:
>
> - Some scripts explicitly use the construct `ns.hack` (no function call) in order to incur a static RAM cost, because they use RAM-dodging techniques that avoid the static cost check in other ways already. This would break that pattern.
> - You claim to be adding lexical analysis, but you're light on the details of how that works. If a variable is assigned inside an `if`, what is the type of the variable for the purposes of your new RAM-checking? Obviously, this cannot be solved perfectly, so it's important that it have understandable rules.

I had a scenario where the word `attempt` as a variable was incorrectly registering as using `ns.codingcontract.attempt`. Instead of just putting in a bug report, I thought I'd try my hand at a solution. So, I appreciate you entertaining my attempt here.

For your first point, I'll add a new test case that shows this new RAM checker handles this situation. I first tested it using the RamDodger3000 library, and the new approach worked as intended (charging for the bare `ns.hack` string). Then I tested the following code manually and added a new test scenario for it:

```js
export async function main(ns) {
  void ns.hack;
  const host = 'n00dles';
  await ns['hack'](host);
}
```

This script costs 1.70 GB because `void ns.hack` is getting registered, while `await ns["hack"](host);` is bypassing the cost.

On your second point, by lexical analysis, I mean it only looks at what names exist in the program text and where they are introduced. The type of the variable or what value it holds is not considered.
