// ECS check: how far does the emulator's ECS go?
// Creates a cluster, registers a Fargate task definition for the sample
// backend, creates a VPC/subnet, runs a task, and watches its lifecycle.
//
// Expected result (verified 2026-11-17, emulator v1.0.483): every
// control-plane call succeeds and the task enters PROVISIONING, but it
// then stops — the emulator has no container runtime, so nothing ever
// listens on the container port. See README.md.
const {
  ECSClient,
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
  DescribeTasksCommand,
} = require("@aws-sdk/client-ecs");
const {
  EC2Client,
  CreateVpcCommand,
  CreateSubnetCommand,
} = require("@aws-sdk/client-ec2");
const { clientConfig } = require("./aws-config");

const ecs = new ECSClient(clientConfig);
const ec2 = new EC2Client(clientConfig);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const cluster = await ecs.send(
    new CreateClusterCommand({ clusterName: "deploy-check-cluster" })
  );
  console.log(
    "cluster:",
    cluster.cluster?.clusterName,
    "status:",
    cluster.cluster?.status
  );

  const td = await ecs.send(
    new RegisterTaskDefinitionCommand({
      family: "deploy-check-backend",
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: "256",
      memory: "512",
      containerDefinitions: [
        {
          name: "backend",
          image: "example/notes-backend:latest",
          portMappings: [{ containerPort: 4000 }],
        },
      ],
    })
  );
  console.log(
    "taskDefinition:",
    td.taskDefinition?.taskDefinitionArn,
    "status:",
    td.taskDefinition?.status
  );

  const vpc = await ec2.send(new CreateVpcCommand({ CidrBlock: "10.0.0.0/16" }));
  const subnet = await ec2.send(
    new CreateSubnetCommand({
      VpcId: vpc.Vpc?.VpcId,
      CidrBlock: "10.0.1.0/24",
    })
  );
  console.log("vpc:", vpc.Vpc?.VpcId, "| subnet:", subnet.Subnet?.SubnetId);

  const run = await ecs.send(
    new RunTaskCommand({
      cluster: "deploy-check-cluster",
      taskDefinition: "deploy-check-backend",
      launchType: "FARGATE",
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: { subnets: [subnet.Subnet?.SubnetId] },
      },
    })
  );
  console.log("runTask failures:", JSON.stringify(run.failures ?? []));
  const taskArn = run.tasks?.[0]?.taskArn;
  let last = run.tasks?.[0]?.lastStatus;
  console.log("task lastStatus:", last);

  // Watch the lifecycle for up to ~30 seconds.
  for (let i = 0; i < 10 && last !== "STOPPED"; i++) {
    await sleep(3000);
    const desc = await ecs.send(
      new DescribeTasksCommand({
        cluster: "deploy-check-cluster",
        tasks: [taskArn],
      })
    );
    last = desc.tasks?.[0]?.lastStatus;
    console.log(`  +${(i + 1) * 3}s lastStatus:`, last);
  }

  console.log(
    "\nSummary: control-plane APIs work, but the task ends at",
    last,
    "— no container runtime, so the backend never starts serving."
  );
})().catch((e) => {
  console.error("ERROR:", e.name, e.message);
  process.exit(1);
});
