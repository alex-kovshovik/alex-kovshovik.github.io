---
layout: post
title:  "Transactions in Rails data migrations"
date:   2014-03-28 21:00:00 -0700
categories: 
---

Just found a useful idea in my friend’s code: **use transactions in database migrations**. This can save you a lot of trouble with partially updated data.

![Person giving a credit card to a computer](https://s3.amazonaws.com/shovik-com/uploads/post_images/2/internet-1593384_1280.jpg?v=63658144892)

I have 2 major types of DB migrations in my Rails applications:

1. Schema changes: adding columns, creating tables, etc.
1. Data modifications: creating new records, fixing bad data, etc.

Occasionally I have really huge and ugly multi-step data modifications with loops, conditions, method calls, etc. And often times while testing them they fail right in the middle… Duh! Then I fix the migration and run it again, but the half the data was already fixed, so the migration fails again.

**Sounds familiar?**

For such data migrations it makes sense to use transactions. Even if migration fails in the middle — no problem, all changes that were already made would be cancelled.

**Example of a nasty data migration with transaction:**

```ruby
class MigrateToNewPageStructure < Migration
  def up
    ActiveRecord::Base.transaction do
      page.find_each do |page|
      update_page(page)
    end
  end
    
  def down
    # Migration down is impossible nor needed.
  end

  private

  def update_page(page)
    # doesn't matter what happens here
  end
end
```

The code snippet above was extracted from my wife’s website: http://www.alkalinemorning.com/. **Update:** my wife's website now runs on Shopify platform, so this code is no longer used.

Happy software construction!