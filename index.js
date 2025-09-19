const express = require('express');
const cors = require('cors');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { messaging } = require('firebase-admin');
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-key.json");

require('dotenv').config();


// middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fkt8fbt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log('decoded token: ', decoded);
    req.decoded = decoded;
    next();

  }
  catch (error) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();


    const packagesCollection = client.db('travel&chill').collection('tourPackages')
    const bookingsCollection = client.db('travel&chill').collection('bookings')


    // jobs => packages/ tour packages
    // application => booking
    app.get("/tourPackages",   async (req, res) => {

      const email = req.query.email;

      // if (email !== req.decoded.email) {
      //   return res.status(403).send({ message: 'forbidden access' })
      // }

      const query = {}
      if (email) {
        query.guide_email = email;
      }

      const cursor = packagesCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });


    app.delete("/tourPackages/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await packagesCollection.deleteOne(query);
      res.send(result);
    });


    app.patch("/tourPackages/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: updateData };
      const result = await packagesCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.get('/tourPackages/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await packagesCollection.findOne(query);
      res.send(result);
    })

    app.post("/tourPackages", async (req, res) => {
      const newTourPackage = req.body;
      const result = await packagesCollection.insertOne(newTourPackage);
      res.send(result);
    });


    app.get('/bookings', verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;

      // jwt works

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = {
        buyer_email: email
      }
      const result = await bookingsCollection.find(query).toArray();

      // bad way to aggregate
      // job_id => tour_id

      for (const booking of result) {
        const tour_id = booking.tour_id;
        const tourQuery = { _id: new ObjectId(tour_id) };
        const tour = await packagesCollection.findOne(tourQuery);
        booking.tour_name = tour.tour_name;
      }


      res.send(result);
    })
// 59_5-7 '/applications/job/:job_id'

// 61-4  firebase token video

    app.post('/bookings', async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    })

    app.post("/bookings", async (req, res) => {

      try {
        const booking = req.body;
        const tourId = new ObjectId(booking.tour_id);

        // Insert the booking into the bookingsCollection
        const bookingResult = await bookingsCollection.insertOne(booking);

        // Update the booking count for the corresponding tour in the packagesCollection
        const updateResult = await packagesCollection.findOneAndUpdate(
          { _id: tourId }, 
          { $inc: { bookingCount: 1 } },  
          { returnDocument: true }  
        );

        if (!updateResult.value) {
          return res.status(404).send("Tour not found");
        }


        res.send({
          success: true,
          bookingResult,
          updateResult,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send("Error creating booking");
      }
    });



    // app.post("/bookings", async (req, res) => {
    //   try {
    //     const booking = req.body;
    //     console.log('Tour ID:', booking.tour_id);


    //     const bookingResult = await bookingsCollection.insertOne(booking);
    //     console.log(bookingResult);

    //     const updateResult = await packagesCollection.findOneAndUpdate(
    //       { _id: new ObjectId(booking.tour_id) },
    //       { $inc: { bookingCount: 1 } },
    //       {returnDocument: true}
    //     );
    //     console.log(updateResult);

    //     res.send({
    //       success: true,
    //       bookingResult,
    //       updateResult
    //     });
    //   } catch (error) {
    //     console.error(error);
    //     res.status(500).send("Error creating booking");
    //   }
    // });


    app.patch('/bookings/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        // Validate id
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid booking ID" });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status: status || "pending" }, // default fallback
        };

        const result = await bookingsCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "Booking not found" });
        }

        res.send({ success: true, message: "Booking status updated", result });
      } catch (error) {
        console.error("Error updating booking:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });




    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('Traveler running')
})

app.listen(port, () => {
  console.log(`Travel & Chill server running on port ${port}`);
})