---
layout: post
title:  "Improve exception handling in Ruby"
date:   2014-04-03 21:00:00 -0700
categories: 
---

Exception handling is important and requires design - just like any other part of your program. Bad exception handling design often results in extended troubleshooting time in production, especially for larger applications with a lot of data. This is especially useful for long running background code that runs through a lot of data.

![Exceptions meme](https://s3.amazonaws.com/shovik-com/uploads/post_images/3/exceptions.jpg?v=63658145185)

I use this one little trick often: whenever I think a method is risky, I always add the exception catch/re-raise clause at the end, with details about method execution context: parameters, other things  -  depending on the context.

For example, the following method is called 100K times within one long-running program:

```ruby
def do_cool_calc(record)
  calc_result = calc(record)
  export(calc_result)
end
```

Obviously since I'm a noob this method is going to fail **1 hour into process** with something like that:

`awesomeness.rb:39:in 'export_bills': undefined method 'name' for nil:NilClass (NoMethodError)`

Wouldn’t it be nice to know which record this code failed on? How about the type of the record? Yeah! Here’s the better version of this method:

```ruby
def do_cool_calc(record)
  calc_result = calc_stuff(record)
  export(calc_result)
rescue Exception => ex
  raise AwesomeError, "#{ex.message}, on #{record.type} ID #{record.id}", ex.backtrace
end
```

This gives you a lot better troubleshooting information:

`awesomeness.rb:39:in 'calc_stuff': undefined method 'name' for nil:NilClass (NoMethodError), on RosterLineItem ID 523967`

Note that in the exception handler above I’m re-raising the exception to still let the program fail. We don’t want the program to just keep going and then fail unexpectedly further along. Also I’m changing the exception backtrace to the original exception’s backtrace  - so that I know the exact point of failure. Otherwise - I’ll only see the line number of where I re-raised the exception, not very useful information.

Happy software construction!
