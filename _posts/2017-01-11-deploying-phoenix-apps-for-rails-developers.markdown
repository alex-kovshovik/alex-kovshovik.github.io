---
layout: post
title:  "Deploying Phoenix Apps for Rails developers: Part 1"
date:   2017-01-11 21:00:00 -0700
categories:
---

In Rails world [capistrano gem](https://github.com/capistrano/capistrano) is pretty much a go to solution, it is proven over and over again in production, it has great documentation and everyone seem to agree that this is the way deploy a Rails application. In Elixir/Phoenix there is no such “go to” solution, not yet. In the [Elixir Users Survey 2016](https://www.dailydrip.com/blog/elixir-users-survey-2016-results) done by [Josh Adams](https://github.com/knewter) 33% of respondents use some ad-hoc way, another 30% use Docker, another 30% deploy to Heroku, finally only 14% use [edeliver](https://github.com/boldpoker/edeliver) and the rest use some other technique. In this post we’re going to learn how to deploy Phoenix apps by doing, just follow along and if something doesn’t work - feel free to leave a comment and I’ll try to help you the best I could.

![Edeliver logo](https://s3.amazonaws.com/shovik-com/uploads/post_images/6/edeliver.jpg?v=63658147257)

At this point in time it not considered easy to deploy Phoenix. In his awesome talk about [Real World Elixir Deployment](https://www.youtube.com/watch?v=H686MDn4Lo8&t=1317s&index=1&list=WL), [Pete Gamache](https://twitter.com/gamache) jokingly says: “You’re going to hurt… a lot” (or something to that effect). Big part of the problem, I think, is lack of the understanding of how deployments <u>should</u> be done in Elixir/Erlang. A lot of Elixir developers come from the world of Rails and so their minds are “infected” by knowledge of Capistrano. This is similar to the problem Subversion users have while trying to learn Git.

> git doesn’t have a high learning curve. svn has a high unlearning curve. observe the difference in those familiar with neither. From https://twitter.com/dlsspy/status/8914952195

Erlang/OTP platform’s proper way of deploying apps is fundamentally different from most other platforms. Erlang VM is meant to run forever. The code changes are hot-loaded into the Erlang VM without a downtime. In Rails world apps are deployed as worker processes. When new code is deployed, new workers are started and old workers are killed. In order to reduce or remove downtime, old requests are kept running on old workers until they’re finished, new requests get routed to new workers. See [Phusion Passenger](https://www.phusionpassenger.com/), [Puma](http://puma.io/) and [Unicorn](https://bogomips.org/unicorn/). Lately Rails apps are deployed as Docker containers, which in essence are processes that are completely self-contained and isolated from the host OS.

You **can** deploy Phoenix in a Docker container, but if you do that, you’ll loose the advantages of Erlang VM’s code-loading and built-in no downtime deployments.

## Deployment plan

It is important to learn the deployment flow in “correct”: order to troubleshoot deployments effectively. I made my way into deployments in the wrong order. I wanted to get something to work quickly: I started with edeliver, then after a few failed attempts I learned more about releases, then I learned about distillery - the latest release build tool. This process ended up taking me longer, because I didn’t understand the foundation of edeliver first: releases.

I assume you already have Erlang, Elixir, NodeJS and NPM installed locally on your local machine. If not, follow [this installation guide](http://www.phoenixframework.org/docs/installation).

**The plan:**

1. Create brand new Phoenix application.
1. Build [distillery](https://github.com/bitwalker/distillery) release.
1. Test distillery release locally.
1. Prepare ONE server in the cloud. We’re not going to create Erlang clusters today :)
1. Deploy distillery release to production using [edeliver](https://github.com/boldpoker/edeliver).
1. Troubleshooting.
1. What’s next?

## 1. Create brand new Phoenix application.

[Follow this guide](http://www.phoenixframework.org/docs/up-and-running) or simply run the following command in your terminal to create an empty Phoenix application:

```shell
mix phoenix.new edelivered_app
```

After the above your Phoenix application would be created in `edelivered_app` directory. Follow the instructions printed out by `mix phoenix.new` command and make sure the application runs on your local system.

Configure `config/prod.secret.exs` with correct database credentials. It is OK to use the same development database here - this file is not committed into a version control and you would have a different copy on your server(s). Your application must run OK in “prod” mode locally, so that you could build a production release.

Make sure this works:

```shell
MIX_ENV=prod mix ecto.create    # create prod database if not the same as dev database.
MIX_ENV=prod mix phoenix.server # run phoenix server in prod mode.
```

Initialize an empty git repo and commit the initial version of your app. You won’t need to push your commits to a source code hosting sites, all you need is a local Git repo.

```shell
git init
git commit -am "Initial commit. First!"
```

## 2. Configure distillery to build releases.

From [distillery’s documentation](https://hexdocs.pm/distillery/terminology.html#content):

> A release is a package of your application’s .beam files, including it’s dependencies .beam files, a sys.config, a vm.args, a boot script, and various utilities and metadata files for managing the release once it is installed. A release may also contain a copy of ERTS (the Erlang Runtime System).

Basically a _release_ is the archive (`*.tar.gz`) with your compiled app and all its dependencies, including even Erlang Runtime itself.

Once built a release is distributed to your servers and deployed. Edeliver does that - see [Configure distillery](/2017/01/11/deploying-phoenix-apps-for-rails-developers.html#distillery).

Add the following to your `mix.exs`:

```elixir
defp deps do
  [
    #...,
    {:distillery, "~> 1.0"}
  ]
```

and run

```shell
mix deps.get
```

Create a release config file:

```shell
mix release.init
```

Review the created `rel/config.exs` file. It would have you default release configured for 2 environments: `dev` and `prod`. You can add more releases and environments to the configuration, but we can stick with the default for now, with one exception.

There is no point in building and running a distillery release in dev mode, it didn’t work by default as of this writing: https://github.com/bitwalker/distillery/issues/25

Let’s configure our release to build `prod` environment by default. Change `default_environment` in `rel/config.exs` to “prod”:

```elixir
use Mix.Releases.Config,
    # This sets the default release built by `mix release`
    default_release: :default,
    # This sets the default environment used by `mix release`
    default_environment: :prod # <------ SET THIS TO :prod
```

Make sure to review the [distillery terminology page](https://hexdocs.pm/distillery/terminology.html#content) it will save you a lot of frustration in reading error messages and googling for solutions later on.

Change the Enpoint in your `config/prod.exs` to look like this:

```elixir
config :edelivered_app, EdeliveredApp.Endpoint,
  http: [port: {:system, "PORT"}],
  url: [host: "localhost", port: {:system, "PORT"}],
  cache_static_manifest: "priv/static/manifest.json",
  server: true,
  root: ".",
  version: Mix.Project.config[:version]
```

It is important to have matching port for both `http` and `url` options. See [Using Distillery With Phoenix](https://hexdocs.pm/distillery/use-with-phoenix.html#configuring-your-release) for explanations of these options.

Now you’re ready to build your first release.

```shell
MIX_ENV=prod mix release
```

We run `mix release` command with `MIX_ENV` set to “prod”, because even if you set your default environment to :prod - distillery still builds your distillery “prod” environment using Mix “dev” environment configuration. Those 2 are not the same thing.

Now you have a production release built!

## 3. Test distillery release locally.

Releases are placed under `_build/<env>/rel/<app-name>` directory by default and you can run a release from within that directory, however to demonstrate the portability of the elixir releases, let’s extract our release archive into a separate folder and run it from there.

1. Create a directory for your app: `mkdir ~/Downloads/edelivered_app`
1. Copy your release into that directory:`cp _build/prod/rel/edelivered_app/releases/0.0.1/edelivered_app.tar.gz ~/Downloads/edelivered_app/`
1. Switch to destination directory: `cd ~/Downloads/edelivered_app/`
1. Extract files from the archive: `tar -zxvf edelivered_app.tar.gz`. I can never remember those tar switches - I just don’t extract `*.tar.gz` files often enough, and so I have a dedicated Evernote document - just for how to extract. **Idea:** create a simple script and name it `untar`.
1. Run the app: `PORT=8080 bin/edelivered_app foreground`. Make sure to set the **required** environment variable PORT to a desired port.

We’re using the “foreground” command to start your app in foreground to begin with - just to see any errors right away.

If the app runs OK in foreground you can start it as a daemon:

```shell
PORT=8080 bin/edelivered_app start
```

Use the same script to stop, restart and even attach to your app. The following are the most useful:

- `bin/edelivered_app` outputs the list of available commands.
- `bin/edelivered_app stop` stops the app.
- `bin/edelivered_app ping` responds with “pong” if everything is OK with your app.
- `bin/edelivered_app remote_console` connects to the running release with IEx console. Unlike “console” or “attach”, “remote_console” would not terminate the running release if you quit the console.

Once deployed you can use the same commands on your production server(s).

Commit your changes: `git commit -am "Add distillery dependency"`

For additional details about building releases follow installation instructions from [distillery’s GitHub page](https://github.com/bitwalker/distillery) or read this awesome guide for [Using Distillery With Phoenix](https://hexdocs.pm/distillery/use-with-phoenix.html). I recommend reading the entire distillery documentation actually - it explains a lot about releases and provides tips on troubleshooting, which I’m going to go over at the end of this post.

## 4. Prepare ONE server in the cloud.

You’ll need an Ubuntu 16.04 Server with the IP address and a SSH port 22 open, with root access.

Use any of the cloud providers to create a new server. I use [Digital Ocean](https://www.digitalocean.com/) for my sites and I had great success with [Linode](https://www.linode.com/), both options have very competitive pricing. All you need is a server with at least 1Gb of RAM. You CAN go with a cheaper 512Mb option, but you’ll need to increase the swap space in order to even build releases on that server, which would be VERY slow. This is [how to increase swap space on Ubuntu 16.04](https://www.digitalocean.com/community/tutorials/how-to-add-swap-space-on-ubuntu-16-04), for example. The red warning box at the top of the post should hopefully dissuade you from doing that.

Another option is to install Ubuntu 16.04 LTS in a virtual machine. [VirtualBox](https://www.virtualbox.org/) would work. Configure your VM’s network with NAT (Network Address Translation) to access it via SSH and HTTP/HTTPS.

For the sake of simplicity we’re not going to use Chef, Ansible or any other DevOps’y tools.

Configure the following:

1. Create new user named “app” with home directory: `adduser app`
1. Put your public RSA key in `/home/app/.ssh/authorized_keys` to SSH to the server without having to type in password. Create `.ssh` directory if doesn’t exist.
1. Set the following permissions:
	 - `chmod 700 /home/app/.ssh`
	 - `chmod 644 /home/app/.ssh/authorized_keys`
	 - `chown -R app:app /home/app/.ssh`
1. Add user “app” to group `sudo` for convenience: edit /etc/group file and tack `app` to the end of the “sudo” line.
1. SSH to the server as user `app`, this shouldn’t ask you for a password.
1. Follow [Ubuntu installation instructions for Elixir](http://elixir-lang.org/install.html#unix-and-unix-like). Install Erlang and Elixir.
1. Follow [How to install NodeJs and NPM on Ubuntu](http://tecadmin.net/install-latest-nodejs-npm-on-ubuntu/).
1. Install git: `sudo apt-get install git`
1. Install Postgres database server: `sudo apt-get install postgresql postgresql-contrib`
1. Configure Postgres role for our app:
   - Switch to linux user “postgres”: `sudo su - postgres`
   - Launch Postgres console client: `psql`
   - `CREATE ROLE app WITH superuser;`
   - `ALTER ROLE app WITH login;`
   - `ALTER ROLE app WITH createdb;`
   - `ALTER USER app WITH PASSWORD 'coolpass';` Please don’t use this password on real servers. :)
   - Exit Postres console client: Ctrd+D.
   - Exit postgres user: exit or Ctrl+D.
1. Create Postgres database for your app: `createdb edelivered_app_prod`
1. Create a directory for your application and settings: `mkdir /home/app/mysite.com`
1. Create a directory for the release store: `mkdir /home/app/mysite.com/edeliver_release_store`
1. Add a global environment variable PORT: `echo "PORT=8080" | sudo tee -a /etc/environment`
1. Add another global environment variable MIX_ENV: `echo "MIX_ENV=prod" | sudo tee -a /etc/environment`

## 5. Deploy distillery release to production using Edeliver.

Edeliver is set of smart scripts that would build the release using `distillery` and deploy it to a number of servers. Unlike Rails and Capistrano, Edeliver uploads your code (using Git) to only ONE of your servers (a build server), compiles it there, compiles and digests assets there and then deploys the prepared package on all servers. Capistrano deploys code to ALL servers and compiles assets on ALL servers (by default).

There is one limitation though: a release must be built on the similar Erlang VM, same architecture. To make matters easier, our “build host” and “production host” are the same host.

Add `edeliver` to your project dependencies and applications:

```elixir
def application, do: [
  applications: [
     ...
    # Add edeliver to the END of the list
    :edeliver
  ]
]

defp deps do
  [
    ...
    {:edeliver, "~> 1.4.0"}
  ]
end
```

and run

```shell
mix deps.get
```

In your project directory, create `.deliver/config` file:

```shell
#!/usr/bin/env bash
APP="edelivered_app" # <--- THIS MUST MATCH THE NAME OF THE RELEASE IN rel/config.exs
                     #      AND THE NAME OF THE APP IN config/mix.exs!!!!!!!!!!

# Configuration of where the releases would be built.
BUILD_HOST="138.197.37.15" # change to your server's IP address
BUILD_USER="app"
BUILD_AT="/home/app/mysite.com/edeliver_builds"

# The location where built releases are going to be stored.
RELEASE_STORE=app@138.197.37.15:/home/app/mysite.com/edeliver_release_store/

# Host and use of where the app would run.
PRODUCTION_HOSTS="138.197.37.15" # same host in our case.
PRODUCTION_USER="app"

DELIVER_TO="/home/app/mysite.com"

pre_erlang_get_and_update_deps() {
 # copy it on the build host to the build directory when building
 local _secret_config_file_on_build_host="/home/app/mysite.com/prod.secret.exs"

 status "Linking '$_secret_config_file_on_build_host' to build config dir"
 __sync_remote "
   ln -sfn '$_secret_config_file_on_build_host' '$BUILD_AT/config/prod.secret.exs'
 "
}

pre_erlang_clean_compile() {
 status "Installing nodejs dependencies"
 __sync_remote "
   [ -f ~/.profile ] && source ~/.profile
   set -e
   cd '$BUILD_AT'

   APP='$APP' MIX_ENV='$TARGET_MIX_ENV' npm install
 "

 status "Building brunch assets"
 __sync_remote "
   [ -f ~/.profile ] && source ~/.profile
   set -e
   cd '$BUILD_AT'

   mkdir -p priv/static
   APP='$APP' MIX_ENV='$TARGET_MIX_ENV' npm run deploy
 "

 status "Compiling code"
 __sync_remote "
   [ -f ~/.profile ] && source ~/.profile
   set -e #
   cd '$BUILD_AT'

   APP='$APP' MIX_ENV='$TARGET_MIX_ENV' $MIX_CMD do deps.get, compile
 "

 status "Running phoenix.digest"
 __sync_remote "
   [ -f ~/.profile ] && source ~/.profile
   set -e #
   cd '$BUILD_AT'

   APP='$APP' MIX_ENV='$TARGET_MIX_ENV' $MIX_CMD phoenix.digest $SILENCE
 "
}
```

The above configuration would generate the following directory structure on the server:

```
/home/app/mysite.com        # Your entire app is in one place: configuration, builds and releases.
├── edeliver_builds         # This is where edeliver builds all releases: your local repo is pushed here.
│   ├── brunch-config.js
│   ├── _build
│   ├── config
│   ├── deps
│   ├── lib
│   ├── mix.exs
│   ├── mix.lock
│   ├── node_modules
│   ├── package.json
│   ├── priv
│   ├── README.md
│   ├── rel
│   ├── test
│   └── web
├── edelivered_app          # Your app is deployed here: this is where it runs, from "bin" directory.
│   ├── bin
│   ├── erl_crash.dump
│   ├── erts-8.2
│   ├── lib
│   ├── releases
│   └── var
├── edeliver_release_store # Edeliver stores all built releases here to then distribute them to servers.
│   └── edelivered_app_0.0.1.release.tar.gz
└── prod.secret.exs        # Your app's secrets: production database connection parameters.
```

Commit the changes and tag the commit with “0.0.1” - a version that matches your project’s version in `mix.exs`.

```shell
git commit -am "Add edeliver configuration"
git tag 0.0.1
```

Tags will be needed for edeliver upgrade releases in the next post.

SSH to your server and create file `/home/app/mysite.com/prod.secret.exs` with the following contents:

```elixir
use Mix.Config

config :edelivered_app, EdeliveredApp.Endpoint,
  secret_key_base: "Xt317VM159wCrVgKhatAAbJcz3/yYewpbuXEpBeUpiIEOBVrTWEW878d6vADJU2u"

config :edelivered_app, EdeliveredApp.Repo,
  adapter: Ecto.Adapters.Postgres,
  username: "app",
  password: "coolpass",
  database: "edelivered_app_prod",
  pool_size: 20
```

Build release, deploy it and run it:

1. `env MIX_ENV=prod mix edeliver build release` builds the release and puts it into the release store on the server.
2. `mix edeliver deploy release to production --version=0.0.1` deploys the release to all servers, but doesn’t run it!
3. Try running your release in foreground mode after the first deploy, just in case:
    - SSH to the server as user `app`.
4. `cd ~/mysite.com/edelivered_app`
5. `bin/edelivered_app foreground`
6. Make sure it started and try to open it in your browser: [http://138.197.37.15:8080](http://138.197.37.15:8080) (your IP address will be different, of course)
7. Exit out of it: Ctrl+C
8. `mix edeliver start production` runs your app as a daemon on your server!

Sometimes start command doesn’t start the release for some reason and I didn’t yet get to the core of the problem. If your site is not available after the `mix edeliver start production`, SSH to the server and see if Erlang process is running: `ps -ef | grep erl`. If not - see the troubleshooting section below.

## 6. Troubleshooting

The latest version of the sample Phoenix app with distillery and edeliver configuration is available here: https://github.com/alex-kovshovik/edelivered_app.

- Always include `MIX_ENV=prod` in all deployment commands.
- If something doesn’t work: remove the `_build` directory and start over.
-  Don’t use AUTO_VERSION right from the start: get the manual versions to work first. I had all kinds of trouble trying to make deployment as easy as the Capistrano deployment. Always bump the version of your app and create tag with the same name.
-  Variable APP must match the release name in rel/config.exs. If doesn’t match, you get: “Failed to build release: :no_release.”
-  Variable APP must match the actual name of the app, otherwise it’ll fail to start! I tried to change it to “current_release” to optimize the server directory structure and was getting unexpected errors.
-  Useful mix edeliver switches:
  - `--verbose` displays the output of all commands;
  - `--debug` displays all commands and their output.
- Fix `rel/config.exs` as explained in [distillery support broke with changed output_dir in distillery 1.0.0 - Issue #182](https://github.com/boldpoker/edeliver/issues/182) - first comment.

## 7. What’s next?

In the next post(s) we’re going to explore:

1. Configuration of [nginx](https://nginx.org/en/) as a reverse proxy for our Erlang VM.
1. Create and configure SSL certificate using [letsencrypt](https://letsencrypt.org/).
1. Build and deploy upgrade releases.
1. Building releases in a docker container or on local VM - to speed up the builds.
1. Build releases on CI server.

[Deploying Phoenix Apps for Rails Developers - Part 2](/2017/01/20/deploying-phoenix-apps-for-rails-developers-part2.html)
