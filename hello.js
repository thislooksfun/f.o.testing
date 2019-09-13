// Code based off of https://github.com/koddsson/eslint-disable-probot
// Taken from commit 5772b6f on Sept 12, 2019

async function getAllLinesCommentedOnByBot(context) {
  const isByBot = comment => comment.user.login === "forbid.io[bot]";
  // wheeeeeeeeee
  return context.github.paginate(
    // context.issue() provides owner, repo, and number
    context.github.pullRequests.listComments(context.issue({ per_page: 100 })),
    ({ data }) => data.filter(isByBot).map(comment => comment.position)
  );
}

module.exports = robot => {
  robot.on(
    ["pull_request.opened", "pull_request.synchronize"],
    async context => {
      const {
        commentLimit,
        commentMessage,
        skipBranchMatching,
      } = await context.config("forbid.only.yml", {
        commentLimit: 10,
        commentMessage: "Please remember to remove your `.only` calls!",
        skipBranchMatching: null,
      });

      // Check if we should skip this branch
      const branchName = context.payload.pull_request.head.ref;
      const regex = new RegExp(skipBranchMatching);
      if (skipBranchMatching && branchName.match(regex)) {
        context.log.warn(
          `Skipping branch: ${branchName} because of regex ${regex}`
        );
        return;
      }

      // Find all the comments on the PR to make sure we don't comment on
      // something we have already commented on.
      const linesCommentedOnByBot = await getAllLinesCommentedOnByBot(context);

      const comments = [];
      context.github.paginate(
        context.github.pullRequests.listFiles(
          // Provides owner, repo, and number
          context.issue({
            headers: { accept: "application/vnd.github.v3.diff" },
            per_page: 100,
          })
        ),
        ({ data: files }, done) => {
          for (const file of files) {
            let currentPosition = 0;
            // TODO: Support other languages?
            if (!file.filename.endsWith(".js")) continue;

            // In order to not spam the PR with comments we'll stop after a
            // certain number of comments
            if (comments.length > commentLimit) break;

            console.log(file.patch);

            // const lines = file.patch.split("\n");
            // for (const line of lines) {
            //   if (line.startsWith("+") && line.includes("eslint-disable")) {
            //     if (!linesCommentedOnByBot.includes(currentPosition)) {
            //       comments.push({
            //         path: file.filename,
            //         position: currentPosition,
            //         body: commentMessage,
            //       });
            //     }
            //   }
            //   // We need to keep a running position of where we are in the file
            //   // so we comment on the right line
            //   currentPosition += 1;
            // }
          }

          if (comments.length >= commentLimit) done();
        }
      );

      // Only post a review if we have some comments
      if (comments.length) {
        await context.github.pullRequests.createReview(
          // Provides owner, repo, and number
          context.issue({
            commit_id: context.payload.pull_request.head.sha,
            event: "REQUEST_CHANGES",
            comments
          })
        );
      }
    }
  );
};
