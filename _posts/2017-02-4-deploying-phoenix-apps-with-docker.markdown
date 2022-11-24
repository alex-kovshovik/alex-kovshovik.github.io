---
layout: post
title:  "Deploying Phoenix Apps with Docker"
date:   2017-02-04 21:00:00 -0700
categories:
---

My earlier attempts at setting up reliable and repeatable Elixir application deployments worked, but I didn’t feel completely safe. I really tried to setup the deployment of my Phoenix app “correctly”, sticking closely to “the standard” - Erlang/OTP, hot code reloading, upgrade releases and automatic versions. About 1/4 of the time upgrades simply didn’t work. The process being so reliable failed like a professional soldier: no complaining, no screaming and no emotions. [edeliver](https://github.com/boldpoker/edeliver) would tell me that everything worked well, but the new code “wasn’t taking”: my changes were not visible on the website until I manually restarted the app on the server. BTW, this is why (as of this writing) this website displays app version in the footer of each page. After hours of troubleshooting I couldn’t figure out a pattern for these seemingly random failures.

Check out my last 2 blog posts for full `distillery` + `edeliver` deployment configuration walkthrough:

- [Deploying Phoenix Apps for Rails developers: Part 1](/2017/01/11/deploying-phoenix-apps-for-rails-developers.html)
- [Deploying Phoenix Apps for Rails developers: Part 2](/2017/01/20/deploying-phoenix-apps-for-rails-developers-part2.html)

Shortly after I finished my last post about Elixir upgrade releases, I came across this [wonderfully useful article](http://teamon.eu/2017/deploying-phoenix-to-production-using-docker/) by [Tymon Tobolski](http://teamon.eu/) about a tool he created - [mix_docker](https://github.com/Recruitee/mix_docker).

This post is the complete walkthrough of the Phoenix app deployment using `mix_docker`. Some of the material here reiterates Tymon’s post while adding much more detail specific to packaging a Phoenix app in a Docker image.

![Docker logo](https://s3.amazonaws.com/shovik-com/uploads/post_images/8/small_v.png?v=63658354361)

**We are going to:**

1. Create brand new Phoenix app.
1. Add `mix_docker`.
1. Customize docker images.
1. Configure your app with ENV variables.
1. Run your app.
1. Draw conclusions. :)

This guide assumes you already have [Docker](https://www.docker.com/), [Elixir](http://elixir-lang.org/) and [Phoenix Framework](http://www.phoenixframework.org/) installed on your machine.

`mix_docker` is a hex package that drastically simplifies the packaging of Elixir releases into a minimal Docker container. The key trick here is to split the construction of your production image into 2 steps:

1. Use a “build image” to compile everything (Elixir code + assets) and build an Erlang release.
1. Create a “release image” and put Erlang release in it.

Quick refresher from [distillery documentation](https://hexdocs.pm/distillery/terminology.html#content) on what Erlang release is:

> A release is a package of your application’s .beam files, including it’s dependencies .beam files, a sys.config, a vm.args, a boot script, and various utilities and metadata files for managing the release once it is installed. A release may also contain a copy of ERTS (the Erlang Runtime System).

`distillery` is the most popular hex package that `mix_docker` uses (depends on) to build Erlang releases.

Build image must have a lot of software installed on it in order to build the release: Erlang, Elixir, NodeJs, etc., hence the image size = large. Release image only needs a matching version of Erlang installed. This is how a release image can be very small. In fact, a release image doesn’t even have to have Erlang installed if you choose to include the Erlang runtime in your application’s release (_default `distillery` setting for production environment_).

## 1. Create brand new Phoenix app

```shell
mix phoenix.new hi_docker
```

It is ok to use an existing app too.

## 2. Add mix_docker

```elixir
def deps do
  [{:mix_docker, "~> 0.3.0"}]
end
```

Set the name for the Docker image in `config/config.exs`:

```elixir
# config/config.exs
config :mix_docker, image: "hi_docker"
```

Run `mix deps.get` to install the added hex package.

Run `mix docker.init` to create default distillery release configuration in `rel/config.exs`.

Edit `rel/config.exs`:

```elixir
# Don't bundle Erlang runtime,
# because it would already be installed in the release image
environment :prod do
  set include_erts: false # set to false.
  # ...
```

Edit `.dockerignore`, add the following lines:

```shell
node_modules
priv/static
hi_docker.tar.gz
```

Add `hi_docker.tar.gz` to your `.gitignore` as well.

We’re going to compile and digest static assets inside of our build image, that way both build image and release image could be built on CI server - as recommended by Tymon himself.

## 3. Customize docker images

Run `mix docker.customize`. This will copy the default `Dockerfile.build` and `Dockerfile.release` into your app’s root directory.

Add the following packages to `Dockerfile.build` using standard Dockerfile commands:

- `nodejs`
- `python`

Install nodejs dependencies and cache them by adding the following lines before the `COPY` command:

```shell
# Cache node deps
COPY package.json ./
RUN npm install
```

Build and digest static assets by adding the following lines after the `COPY` command:

```shell
RUN ./node_modules/brunch/bin/brunch b -p && \
    mix phoenix.digest
```

Test the `Dockerfile.build`:

```shell
mix docker.build
```

Complete listing of `Dockerfile.build`:

```dockerfile
FROM bitwalker/alpine-erlang:6.1

ENV HOME=/opt/app/ TERM=xterm

# Install Elixir and basic build dependencies
RUN \
    echo "@edge http://nl.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    apk update && \
    apk --no-cache --update add \
      git make g++ nodejs python \
      elixir@edge && \
    rm -rf /var/cache/apk/*

# Install Hex+Rebar
RUN mix local.hex --force && \
    mix local.rebar --force

WORKDIR /opt/app

ENV MIX_ENV=prod

# Cache elixir deps
COPY mix.exs mix.lock ./
RUN mix do deps.get, deps.compile

# Cache node deps
COPY package.json ./
RUN npm install

COPY . .

RUN ./node_modules/brunch/bin/brunch b -p && \
    mix phoenix.digest

RUN mix release --env=prod --verbose
```

## 4. Configure your app with ENV variables

The best way to provide runtime configuration is via environment variables. Remember [The Twelve-Factor App](https://12factor.net/)? These principles still apply here.

Remove `config/prod.secret.exs` file and remove a reference to it from `config/prod.exs`. Configure your app’s secrets directly in `config/prod.exs` using environment variables:

```elixir
# config/prod.exs
#
# Configure your app's endpoint.
config :hi_docker, HiDocker.Endpoint,
  http: [port: {:system, "PORT"}],
  url: [host: "${HOST}", port: {:system, "PORT"}],
  secret_key_base: "${SECRET_KEY_BASE}",
  cache_static_manifest: "priv/static/manifest.json",
  server: true,
  root: ".",
  version: Mix.Project.config[:version]

# Configure your database
config :hi_docker, HiDocker.Repo,
  adapter: Ecto.Adapters.Postgres,
  hostname: "${DB_HOST}",
  database: "${DB_NAME}",
  username: "${DB_USER}",
  password: "${DB_PASSWORD}",
  pool_size: 20
```

## 5. Run your app

No changes are needed for the default `Dockerfile.release` - it works as is!

Build production image:

1. `mix docker.build`
2. `mix docker.release`

**Run your production image!**

`docker run -it --rm -p 8080:8080 -e PORT=8080 -e HOST=<domain-name> -e DB_HOST=<postgresql-domain> -e DB_NAME=hi_docker -e DB_USER=<postgresql-user> -e DB_PASSWORD=<postgresql-password> -e SECRET_KEY_BASE=<top-secret> hi_docker:release foreground`

The above command starts a Docker container using your release image - `hi_docker:release`. It simply runs the Erlang release with your app in the “foreground” mode.

Breakdown of the switches:

- `-it` a combination of 2 docker run switches: “-i” and “-t” to run your container in the “interactive” mode with TTY allocated, so that you could stop your container by pressing `Ctrl + C`.
- `--rm` tells docker to delete the container automatically after it is stopped. By default docker does not delete stopped containers, you could either delete them manually (`docker rm CID`) or use `--rm` to prevent “container pollution”.
- `-p 8080:8080` maps port 8080 on your machine to port 8080 inside of the docker container.
- `-e PORT=8080` sets environment variable `PORT` to 8080 inside of the container.
- `-e HOST=<domain-name>` sets the ENV variable to be used by your app to generate URLs, this is your website’s domain name!
- `-e DB_HOST` and related `DB_` variables - no explanation needed.
- `-e SECRET_KEY_BASE=<top-secret>` another ENV variable used by Phoenix to verify integrity of cookies.
- `hi_docker:release` name of your release image and a tag.
- `foreground` the argument for your app’s release executable, to tell Erlang to run your app in “foreground” mode: it logs everything into STDOUT and lets you stop the app by pressing `Ctrl + C`.

**Postgresql settings**

I assume you’re running your production release image on you personal computer (for now) and `Postgresql` database server runs locally. By default Posgresql only allows connections from `localhost`. Your app is running inside of a container where the `localhost` means a different thing: you need to [configure your Postgresql to allow remote connections](http://www.thegeekstuff.com/2014/02/enable-remote-postgresql-connection/?utm_source=tuicool). If you’re running the macOS and Postgresql is installed via [Homebrew](http://brew.sh/), then your postgres config is likely located in `/usr/local/var/postgres`: both `pg_hba.conf` and `postgresql.conf`.

**Ready for production?**

Head over to [Tymon’s post on setting up Elixir Cluster Using Docker and Rancher](http://teamon.eu/2017/setting-up-elixir-cluster-using-docker-and-rancher/).

## 6. Conclusions

As of this writing, this website is not running on Docker - it is still deployed using “classic” Erlang upgrade releases. My plan is to migrate to Docker, which would hopefully let me switch the focus from deployment to development :)

I feel a lot better about deploying my Phoenix apps with Docker: it is **reliable** and **repeatable**, exactly what deployment must be. I can build my release image on my personal computer and on a CI server, as part of CI build. I can run my release image anywhere Docker runs.

There ARE legitimate uses for hot code upgrades. [Barry Jones](https://blog.codeship.com/author/barryjones/) from Codeship pointed out [in his blog post](https://blog.codeship.com/comparing-elixir-go/) that upgrade releases are “a little bit more complex” and `distillery` _“goes out of its way to make this easy… but that still doesn’t mean you should always use it.”_

How do you deploy your Phoenix apps?