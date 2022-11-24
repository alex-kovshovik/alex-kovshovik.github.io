---
layout: post
title:  "Migrating a website to new server with minimal downtime"
date:   2014-07-22 21:00:00 -0700
categories:
---

Once a customer asked me to move their smallish website to a new server: to deploy enhancements and upgrade OS with latest security patches. They were too afraid to upgrade Linux OS on the old one for it was too far behind with upgrades. There was one requirement: “please keep the downtime to a minimum”.

## Warnings and Limitations

This post is about relatively small websites with tiny databases:

- One server with everything on it: web server, database, files.
- Up to ~5 Gb database.
- Up to ~5 Gb of files.

It wouldn’t work for larger sites because it takes a lot more time to back them up and restore, so for these sites some DB replication should probably be setup, etc.

My website is a Rails application, but this same technique should apply for anything else out there.

## Introduction

Sometimes it is necessary to move a website or a couple from one VPS host to another. In my case I was moving one website from one Digital Ocean droplet to another, just because I decided to upgrade to the latest LTS version of Ubuntu Server  - 14.04. I do not have any load balancing setup with multiple hosts involved, nor do I have any HA solutions in place. Everything is on one host: web server, Rails application, database, file storage, etc. If I had a dedicated load balancer host I could’ve switched backends with ease.

I didn’t really have to, but I decided I’d try to migrate with very little or no downtime  -  just to learn how it’s done. Turns out it is not as hard as I thought.

The biggest issue is DNS propagation: it is not fast, sometimes it takes a couple of hours to fully propagate, especially if you’re changing your name servers at the same time. During this time it is possible that some requests would go to a new server, some would still hit the old one. This means that your users could create content on both sites, which is a problem.

## High level steps

1. Configure new host with the website.
1. Verify website on the new host using hosts file.
1. Configure nginx on the old host to proxy all requests to new one.
1. Figure out SSL thing.

## Details

### 1. Configure new host with the website

There is a ton of information on how to configure new Linux server with webserver and a website, so I wouldn’t go into a lot of detail here.

For example: [How To Install Ruby on Rails on Ubuntu 14.04 using RVM](https://www.digitalocean.com/community/tutorials/how-to-install-ruby-on-rails-on-ubuntu-14-04-using-rvm)

### 2. Verify website on the new host using hosts file

At this point DNS is still configured to send all requests to the old host we’re trying to migrate off of. There is a very easy way to configure your own computer to send all requests for a specific URL to the new host.

Edit your “hosts” file:

- Linux or Mac: edit /etc/hosts
- Windows: http://www.rackspace.com/knowledge_center/article/how-do-i-modify-my-hosts-file#Windows_Vista

Add a line like this to the bottom of it:

```shell
192.168.253.17 yourcoolwebsite.com
```

This will point all requests for yourcoolwebsite.com to 192.168.253.17.

**Please note:** use your domain name without http or https.

After the above you could just open your website in any browser and you would be testing it on the new host while everybody else on the Internet would still be using old host.

### 3. Configure nginx on the old host to proxy all requests to a new one

I started from [this article from nginx documentation](http://nginx.org/en/docs/beginners_guide.html#proxy). It shows how to configure a pretty basic proxy, which is more than enough for our cause.

Also since I need to proxy ALL requests to the new server, the nginx “server” config is very basic:

```shell
server {
  listen 80;
  server_name yourdomain.com;
  location / {
    proxy_pass http://192.168.1.1:8080; 
  }
}
```

This tells nginx to proxy all requests to IP 192.168.1.1, port 8080.

At this point we’re going to need to move quickly, so prepare to perform the following steps:

1. Stop web server on the old server.
1. Make a backup of the database and any user files. This ensures that all the latest data created by your users isn’t lost and that the users can’t create any new data on the old server until all requests are proxies to the new one.
1. Move the backups to the new server.
1. Restore backups on the new server.
1. Start the proxy on the old server. In my case I had Apache running as a web server on the old host, so I only had to shutdown Apache and start nginx. If you had nginx as a web server already, then you’ll only have to comment out the old “server” section of your website and uncomment the new “server” section with the proxy configuration.
1. Change DNS to point your domain to the new server.

### 4. Figure out SSL thing

If you have SSL/HTTPS configured on your site, then you’ll need to do a bit more work, because you don’t want to configure a double SSL encryption:

1. Between your user and Nginx proxy.
1. Between Nginx proxy and a new server.

To solve this I came up with a very simple idea: configure new server to run a website on port 80 (redirects to https 443) and port 8080, which is only accessible for connections from the old server’s IP address. With that my system only has SSL between the end user and nginx proxy. All the requests between the proxy and a new server are transmitted unencrypted.

I guess, this is a security concern, but this it is within the same datacenter (which I trust), this wasn’t a big deal for me.

For the proxy I ended up with the following configuration:

```shell
server {
  listen 80;
  listen 443 ssl;
  ssl_certificate cert_file_name_and_path;
  ssl_certificate_key key_file_name_and_path;
  server_name yourdomain.com;

  location / {
    proxy_pass http://192.168.1.1:8080;
  }

  if ($ssl_protocol = "") {
    rewrite ^ https://$server_name$request_uri? permanent; 
  }
}
```

This setup has to only be in place for a couple of hours  -  while DNS changes propagate. After that the old server could just be shut down and port 8080 on the new server could be closed.

I’m going to move another website and I’ll follow this blog post and would update stuff as I go, but the general idea should be clear.

_Originally published at alex.shovik.com on July 22, 2014._